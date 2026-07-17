import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Paper } from "../../shared/contracts";
import type { AiProvider, AnalysisRequest } from "./ai/types";
import { RadarRepository } from "../db/radarRepository";
import { Repository } from "../db/repository";
import { openDatabase } from "../db/schema";
import { RadarService } from "./radarService";

const makePaper = (index: number): Paper => ({
  id: `p${index}`,
  title: `Spectroscopy paper ${index}`,
  abstract: "Warm Neptune atmospheric spectroscopy.",
  authors: [`Team ${index % 4}`],
  publishedAt: `2026-07-${String(17 - (index % 10)).padStart(2, "0")}T00:00:00.000Z`,
  journal: "ApJ",
  doi: null,
  arxivId: `2607.${String(index).padStart(5, "0")}`,
  bibcode: null,
  citationCount: index,
  sources: ["arxiv"],
  sourceUrls: { arxiv: `https://arxiv.org/abs/2607.${String(index).padStart(5, "0")}` },
  matchedSearchIds: [],
  favorite: false,
  read: false,
});

const provider = (): AiProvider => ({
  status: vi.fn(async () => ({ available: true, baseUrl: "https://example.test/v1", model: "radar-model", message: null })),
  previewProfile: vi.fn(async () => []),
  analyze: vi.fn(async (request: AnalysisRequest) => request.papers.map((paper, index: number) => ({
    paperId: paper.id,
    semanticScore: 90 - index,
    topics: ["spectroscopy"],
    reason: "The method matches the profile.",
    emergingTopicCandidates: [],
    confidence: 0.9,
    recommend: true,
  }))),
});

describe("RadarService", () => {
  let database: ReturnType<typeof openDatabase>;
  let papers: Repository;
  let radar: RadarRepository;

  beforeEach(() => {
    database = openDatabase(":memory:");
    papers = new Repository(database);
    radar = new RadarRepository(database, () => new Date("2026-07-17T08:00:00.000Z"));
    radar.confirmProfile("I study warm Neptune spectroscopy.", [
      { kind: "method", value: "spectroscopy", weight: 1 },
    ]);
  });

  afterEach(() => database.close());

  it("stores 5-10 papers and reuses the same order on the same profile day", async () => {
    papers.upsertPapers(Array.from({ length: 12 }, (_, index) => makePaper(index)));
    const ai = provider();
    const service = new RadarService(papers, radar, ai, () => new Date("2026-07-17T08:00:00.000Z"));

    const first = await service.getDailySelection();
    const second = await service.getDailySelection();

    expect(first.paperIds).toHaveLength(10);
    expect(second.paperIds).toEqual(first.paperIds);
    expect(ai.analyze).toHaveBeenCalledTimes(1);
  });

  it("returns rule-ranked papers when AI analysis fails", async () => {
    papers.upsertPapers(Array.from({ length: 6 }, (_, index) => makePaper(index)));
    const ai = provider();
    vi.mocked(ai.analyze).mockRejectedValue(new Error("rate limited"));
    const service = new RadarService(papers, radar, ai, () => new Date("2026-07-17T08:00:00.000Z"));

    const result = await service.recomputeDaily();

    expect(result.mode).toBe("rule-only");
    expect(result.paperIds).toHaveLength(6);
  });

  it("sends at most 30 leading candidates to AI", async () => {
    papers.upsertPapers(Array.from({ length: 35 }, (_, index) => makePaper(index)));
    const ai = provider();
    const service = new RadarService(papers, radar, ai, () => new Date("2026-07-17T08:00:00.000Z"));

    await service.recomputeDaily();

    expect(vi.mocked(ai.analyze).mock.calls[0][0].papers).toHaveLength(30);
  });

  it("records and undoes explicit relevance feedback", () => {
    papers.upsertPapers([makePaper(1)]);
    const service = new RadarService(papers, radar, undefined, () => new Date("2026-07-17T08:00:00.000Z"));

    const recorded = service.recordFeedback("p1", { relevance: "irrelevant", reason: "wrong-method" });
    expect(recorded).toMatchObject({ paperId: "p1", relevance: "irrelevant", undone: false });
    expect(service.undoFeedback("p1")).toMatchObject({ paperId: "p1", undone: true });
  });
});
