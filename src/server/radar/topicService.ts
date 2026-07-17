import { createHash } from "node:crypto";

import type { Paper } from "../../shared/contracts";
import type { PaperAnalysis, PaperScore, ResearchTopic } from "../../shared/radar";
import type { RadarRepository } from "../db/radarRepository";
import type { Repository } from "../db/repository";

const DAY = 24 * 60 * 60 * 1_000;
const normalize = (value: string): string => value.normalize("NFKC").trim().toLocaleLowerCase("en-US");
const topicId = (kind: ResearchTopic["kind"], profileVersion: number, label: string): string =>
  `${kind}:${profileVersion}:${createHash("sha1").update(normalize(label)).digest("hex").slice(0, 12)}`;

type Evidence = { paper: Paper; analysis: PaperAnalysis; score: PaperScore | undefined };

const windows = (evidence: Evidence[], now: Date) => {
  const timestamp = now.getTime();
  return {
    recent: evidence.filter(({ paper }) => {
      const date = new Date(paper.publishedAt).getTime();
      return date <= timestamp && date >= timestamp - 7 * DAY;
    }),
    baseline: evidence.filter(({ paper }) => {
      const date = new Date(paper.publishedAt).getTime();
      return date < timestamp - 7 * DAY && date >= timestamp - 37 * DAY;
    }),
  };
};

const growth = (recent: number, baseline: number): number => {
  if (baseline === 0) return recent > 0 ? 1 : 0;
  return Math.round((((recent / 7) - (baseline / 30)) / (baseline / 30)) * 100) / 100;
};

const makeTopic = (
  kind: ResearchTopic["kind"],
  label: string,
  profileVersion: number,
  evidence: Evidence[],
  now: Date,
): ResearchTopic => {
  const { recent, baseline } = windows(evidence, now);
  const teams = [...new Set(recent.map(({ paper }) => paper.authors[0]).filter(Boolean))].sort();
  const confidence = recent.length === 0 ? 0 : recent.reduce((total, item) => total + item.analysis.confidence, 0) / recent.length;
  const highRelevanceCount = recent.filter(({ score }) => (score?.final ?? 0) >= 85).length;
  const baselineChange = growth(recent.length, baseline.length);
  const qualifies = recent.length >= 3 && teams.length >= 2 && confidence >= 0.7 && (baselineChange >= 0.5 || highRelevanceCount >= 2);
  const stableStatus = baselineChange > 0.2 ? "rising" : baselineChange < -0.2 ? "cooling" : "stable";
  return {
    id: topicId(kind, profileVersion, label),
    profileVersion,
    kind,
    label,
    status: kind === "emerging" ? (qualifies ? "emerging" : "signal") : stableStatus,
    confidence: Math.round(confidence * 100) / 100,
    paperCount7d: recent.length,
    highRelevanceCount,
    baselineChange,
    representativePaperIds: recent
      .sort((left, right) => (right.score?.final ?? 0) - (left.score?.final ?? 0))
      .slice(0, 5)
      .map(({ paper }) => paper.id),
    activeTeams: teams,
    summary: `${recent.length} papers in the last 7 days; ${teams.length} independent teams.`,
    updatedAt: now.toISOString(),
  };
};

export class TopicService {
  constructor(
    private readonly papers: Repository,
    private readonly radar: RadarRepository,
  ) {}

  buildTopics(profileVersion: number, now: Date): ResearchTopic[] {
    const profile = this.radar.getActiveProfile();
    if (!profile || profile.version !== profileVersion) throw new Error("Active research profile not found");
    const allPapers = this.papers.listPapers({ sort: "latest", state: "all" });
    const paperMap = new Map(allPapers.map((paper) => [paper.id, paper]));
    const scoreMap = new Map(this.radar.listScores(profileVersion).map((score) => [score.paperId, score]));
    const analyses = this.radar.listAnalyses(profileVersion);
    const evidence = analyses.flatMap((analysis): Evidence[] => {
      const paper = paperMap.get(analysis.paperId);
      return paper ? [{ paper, analysis, score: scoreMap.get(paper.id) }] : [];
    });

    const stable = this.radar.listFacets(profile.id)
      .filter((facet) => ["topic", "object", "method", "data-type"].includes(facet.kind))
      .map((facet) => makeTopic("stable", facet.value, profileVersion, evidence.filter(({ paper, analysis }) =>
        analysis.topics.some((value) => normalize(value) === normalize(facet.value)) ||
        normalize(`${paper.title} ${paper.abstract}`).includes(normalize(facet.value))), now));

    const emergingLabels = new Map<string, string>();
    for (const { analysis } of evidence) {
      for (const label of analysis.emergingTopicCandidates) emergingLabels.set(normalize(label), label.trim());
    }
    const emerging = [...emergingLabels.values()].map((label) => makeTopic(
      "emerging",
      label,
      profileVersion,
      evidence.filter(({ analysis }) => analysis.emergingTopicCandidates.some((value) => normalize(value) === normalize(label))),
      now,
    ));

    const topics = [...stable, ...emerging];
    this.radar.saveTopics(topics);
    return topics;
  }

  getTopicDetail(id: string, windowDays: number): { topic: ResearchTopic; papers: Paper[] } {
    const profile = this.radar.getActiveProfile();
    if (!profile) throw new Error("Research profile required");
    const topic = this.radar.listTopics(profile.version).find((item) => item.id === id);
    if (!topic) throw new Error("Research topic not found");
    const cutoff = Date.now() - Math.max(1, windowDays) * DAY;
    const papers = this.papers.listPapers({ sort: "latest", state: "all" })
      .filter((paper) => topic.representativePaperIds.includes(paper.id) && new Date(paper.publishedAt).getTime() >= cutoff);
    return { topic, papers };
  }
}
