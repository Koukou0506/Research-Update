import { createHash } from "node:crypto";

import type { DailySelection, PaperAnalysis, PaperFeedback } from "../../shared/radar";
import type { RadarRepository } from "../db/radarRepository";
import type { Repository } from "../db/repository";
import { buildAnalysisCacheKey } from "./ai/openaiCompatible";
import type { AiProvider } from "./ai/types";
import { combineScores, scorePaper } from "./ruleScore";

type FeedbackRequest = {
  relevance: "relevant" | "irrelevant";
  reason: PaperFeedback["reason"];
};

const contentHash = (paper: { title: string; abstract: string; authors: string[] }): string => createHash("sha256")
  .update(JSON.stringify({ title: paper.title, abstract: paper.abstract, authors: paper.authors }))
  .digest("hex");

export class RadarService {
  constructor(
    private readonly papers: Repository,
    private readonly radar: RadarRepository,
    private readonly ai?: AiProvider,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async getDailySelection(): Promise<DailySelection> {
    const profile = this.radar.getActiveProfile();
    if (!profile) throw new Error("Research profile required");
    const date = this.clock().toISOString().slice(0, 10);
    return this.radar.getDailySelection(date, profile.version) ?? this.recomputeDaily();
  }

  async recomputeDaily(): Promise<DailySelection> {
    const profile = this.radar.getActiveProfile();
    if (!profile) throw new Error("Research profile required");
    const facets = this.radar.listFacets(profile.id);
    const feedback = this.radar.listFeedback();
    const candidates = this.papers.listPapers({ sort: "latest", state: "all" })
      .map((paper) => ({ paper, rule: scorePaper(paper, facets, feedback) }))
      .filter((candidate) => !candidate.rule.excluded)
      .sort((left, right) => right.rule.score - left.rule.score || right.paper.publishedAt.localeCompare(left.paper.publishedAt))
      .slice(0, 30);

    const analyses = new Map<string, PaperAnalysis>();
    if (this.ai && candidates.length > 0) {
      try {
        const status = await this.ai.status();
        const missing = candidates.filter(({ paper }) => {
          const cacheKey = buildAnalysisCacheKey({
            paperId: paper.id,
            contentHash: contentHash(paper),
            profileVersion: profile.version,
            schemaVersion: 1,
            baseUrl: status.baseUrl,
            model: status.model,
          });
          const cached = this.radar.findAnalysis(cacheKey);
          if (cached) analyses.set(paper.id, cached);
          return !cached;
        });
        if (missing.length > 0) {
          const fresh = await this.ai.analyze({
            profile: {
              text: profile.text,
              version: profile.version,
              facets: facets.map(({ kind, value, weight }) => ({ kind, value, weight })),
            },
            papers: missing.map(({ paper }) => ({
              id: paper.id,
              title: paper.title,
              abstract: paper.abstract,
              authors: paper.authors,
            })),
          });
          for (const item of fresh) {
            const paper = missing.find((candidate) => candidate.paper.id === item.paperId)?.paper;
            if (!paper) continue;
            const analysis: PaperAnalysis = {
              ...item,
              cacheKey: buildAnalysisCacheKey({
                paperId: paper.id,
                contentHash: contentHash(paper),
                profileVersion: profile.version,
                schemaVersion: 1,
                baseUrl: status.baseUrl,
                model: status.model,
              }),
              profileVersion: profile.version,
              providerBaseUrl: status.baseUrl,
              model: status.model,
              schemaVersion: 1,
              createdAt: this.clock().toISOString(),
            };
            this.radar.saveAnalysis(analysis);
            analyses.set(paper.id, analysis);
          }
        }
      } catch {
        analyses.clear();
      }
    }

    const ranked = candidates.map(({ paper, rule }) => {
      const analysis = analyses.get(paper.id);
      const combined = combineScores({ rule: rule.score, semantic: analysis?.semanticScore ?? null, feedback: rule.feedbackScore });
      this.radar.saveScore({
        paperId: paper.id,
        profileVersion: profile.version,
        ...combined,
        evidence: rule.evidence,
        createdAt: this.clock().toISOString(),
      });
      return { paper, combined };
    }).sort((left, right) => right.combined.final - left.combined.final || right.paper.publishedAt.localeCompare(left.paper.publishedAt));

    const selection: DailySelection = {
      date: this.clock().toISOString().slice(0, 10),
      profileVersion: profile.version,
      paperIds: ranked.slice(0, 10).map(({ paper }) => paper.id),
      mode: analyses.size > 0 ? "hybrid" : "rule-only",
      createdAt: this.clock().toISOString(),
    };
    this.radar.saveDailySelection(selection);
    return selection;
  }

  recordFeedback(paperId: string, input: FeedbackRequest): PaperFeedback {
    return this.radar.saveFeedback({ paperId, ...input, undone: false });
  }

  undoFeedback(paperId: string): PaperFeedback | null {
    return this.radar.undoFeedback(paperId);
  }
}
