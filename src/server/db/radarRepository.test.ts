import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Paper } from "../../shared/contracts";
import type { PaperAnalysis, PaperScore, ResearchTopic } from "../../shared/radar";
import { RadarRepository } from "./radarRepository";
import { Repository } from "./repository";
import { openDatabase } from "./schema";

const paper: Paper = {
  id: "p1",
  title: "Atmospheric retrieval with high-resolution spectroscopy",
  abstract: "A fixed abstract.",
  authors: ["Ada Astronomer"],
  publishedAt: "2026-07-17T00:00:00.000Z",
  journal: "ApJ",
  doi: null,
  arxivId: "2607.00001",
  bibcode: null,
  citationCount: 2,
  sources: ["arxiv"],
  sourceUrls: { arxiv: "https://arxiv.org/abs/2607.00001" },
  matchedSearchIds: [],
  favorite: false,
  read: false,
};

describe("RadarRepository", () => {
  let database: ReturnType<typeof openDatabase>;
  let radar: RadarRepository;

  beforeEach(() => {
    database = openDatabase(":memory:");
    new Repository(database).upsertPapers([paper]);
    radar = new RadarRepository(database, () => new Date("2026-07-17T08:00:00.000Z"));
  });

  afterEach(() => database.close());

  it("versions confirmed profiles without overwriting history", () => {
    const first = radar.confirmProfile("spectroscopy", [
      { kind: "method", value: "spectroscopy", weight: 1 },
    ]);
    const second = radar.confirmProfile("retrieval", [
      { kind: "method", value: "retrieval", weight: 0.8 },
    ]);

    expect(second.version).toBe(first.version + 1);
    expect(radar.getActiveProfile()?.text).toBe("retrieval");
    expect(radar.listFacets(second.id)).toEqual([
      expect.objectContaining({ kind: "method", value: "retrieval", weight: 0.8 }),
    ]);
  });

  it("round-trips cached analysis and explainable scores", () => {
    const analysis: PaperAnalysis = {
      paperId: paper.id,
      cacheKey: "cache-1",
      profileVersion: 1,
      semanticScore: 91,
      topics: ["spectroscopy"],
      reason: "The method matches the confirmed profile.",
      emergingTopicCandidates: ["3D retrieval"],
      confidence: 0.92,
      recommend: true,
      providerBaseUrl: "https://example.test/v1",
      model: "test-model",
      schemaVersion: 1,
      createdAt: "2026-07-17T08:00:00.000Z",
    };
    const score: PaperScore = {
      paperId: paper.id,
      profileVersion: 1,
      rule: 80,
      semantic: 91,
      feedback: 50,
      final: 79.35,
      mode: "hybrid",
      evidence: [{ kind: "method", facet: "spectroscopy", contribution: 20 }],
      createdAt: "2026-07-17T08:00:00.000Z",
    };

    radar.saveAnalysis(analysis);
    radar.saveScore(score);

    expect(radar.findAnalysis("cache-1")).toEqual(analysis);
    expect(radar.getScore(paper.id, 1)).toEqual(score);
  });

  it("persists feedback, supports undo, and stores topics", () => {
    const feedback = radar.saveFeedback({
      paperId: paper.id,
      relevance: "irrelevant",
      reason: "wrong-method",
      undone: false,
    });
    const topic: ResearchTopic = {
      id: "topic-1",
      profileVersion: 1,
      kind: "stable",
      label: "spectroscopy",
      status: "rising",
      confidence: 0.9,
      paperCount7d: 5,
      highRelevanceCount: 3,
      baselineChange: 0.5,
      representativePaperIds: [paper.id],
      activeTeams: ["Ada Astronomer"],
      summary: "Five recent papers support this change.",
      updatedAt: "2026-07-17T08:00:00.000Z",
    };

    radar.saveTopics([topic]);
    expect(radar.listFeedback(paper.id)).toEqual([feedback]);
    expect(radar.undoFeedback(paper.id)?.undone).toBe(true);
    expect(radar.listTopics(1)).toEqual([topic]);
  });

  it("stores and reuses a stable daily selection", () => {
    radar.saveDailySelection({
      date: "2026-07-17",
      profileVersion: 1,
      paperIds: [paper.id],
      mode: "rule-only",
      createdAt: "2026-07-17T08:00:00.000Z",
    });

    expect(radar.getDailySelection("2026-07-17", 1)).toEqual({
      date: "2026-07-17",
      profileVersion: 1,
      paperIds: [paper.id],
      mode: "rule-only",
      createdAt: "2026-07-17T08:00:00.000Z",
    });
  });
});
