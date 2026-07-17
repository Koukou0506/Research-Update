import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Paper } from "../../shared/contracts";
import { RadarRepository } from "../db/radarRepository";
import { Repository } from "../db/repository";
import { openDatabase } from "../db/schema";
import { TopicService } from "./topicService";

const makePaper = (id: string, publishedAt: string, author: string): Paper => ({
  id,
  title: `${id} spectroscopy paper`,
  abstract: "A fixed research result.",
  authors: [author],
  publishedAt,
  journal: "ApJ",
  doi: null,
  arxivId: id,
  bibcode: null,
  citationCount: 0,
  sources: ["arxiv"],
  sourceUrls: { arxiv: `https://arxiv.org/abs/${id}` },
  matchedSearchIds: [],
  favorite: false,
  read: false,
});

describe("TopicService", () => {
  let database: ReturnType<typeof openDatabase>;
  let papers: Repository;
  let radar: RadarRepository;
  let profileVersion: number;

  beforeEach(() => {
    database = openDatabase(":memory:");
    papers = new Repository(database);
    radar = new RadarRepository(database);
    profileVersion = radar.confirmProfile("I study spectroscopy.", [
      { kind: "method", value: "spectroscopy", weight: 1 },
    ]).version;
  });

  afterEach(() => database.close());

  const addAnalyzedPaper = (paper: Paper, emerging: string[] = ["3D retrieval"], score = 90) => {
    papers.upsertPapers([paper]);
    radar.saveAnalysis({
      paperId: paper.id,
      cacheKey: `cache-${paper.id}`,
      profileVersion,
      semanticScore: score,
      topics: ["spectroscopy"],
      reason: "Grounded in the paper.",
      emergingTopicCandidates: emerging,
      confidence: 0.9,
      recommend: true,
      providerBaseUrl: "https://example.test/v1",
      model: "test",
      schemaVersion: 1,
      createdAt: "2026-07-17T08:00:00.000Z",
    });
    radar.saveScore({
      paperId: paper.id,
      profileVersion,
      rule: 50,
      semantic: score,
      feedback: 50,
      final: score,
      mode: "hybrid",
      evidence: [],
      createdAt: "2026-07-17T08:00:00.000Z",
    });
  };

  it("builds stable profile topics and an evidence-backed emerging topic", () => {
    addAnalyzedPaper(makePaper("p1", "2026-07-17T00:00:00.000Z", "Team A"));
    addAnalyzedPaper(makePaper("p2", "2026-07-16T00:00:00.000Z", "Team B"));
    addAnalyzedPaper(makePaper("p3", "2026-07-15T00:00:00.000Z", "Team C"));
    const service = new TopicService(papers, radar);

    const topics = service.buildTopics(profileVersion, new Date("2026-07-17T12:00:00.000Z"));

    expect(topics).toContainEqual(expect.objectContaining({ kind: "stable", label: "spectroscopy" }));
    expect(topics).toContainEqual(expect.objectContaining({
      kind: "emerging",
      label: "3D retrieval",
      status: "emerging",
      paperCount7d: 3,
      activeTeams: ["Team A", "Team B", "Team C"],
    }));
  });

  it("labels insufficient team diversity as a signal, not a trend", () => {
    addAnalyzedPaper(makePaper("p1", "2026-07-17T00:00:00.000Z", "Team A"));
    addAnalyzedPaper(makePaper("p2", "2026-07-16T00:00:00.000Z", "Team A"));
    addAnalyzedPaper(makePaper("p3", "2026-07-15T00:00:00.000Z", "Team A"));

    const topic = new TopicService(papers, radar)
      .buildTopics(profileVersion, new Date("2026-07-17T12:00:00.000Z"))
      .find((item) => item.label === "3D retrieval");

    expect(topic?.status).toBe("signal");
  });

  it("returns the representative papers for a persisted topic", () => {
    addAnalyzedPaper(makePaper("p1", "2026-07-17T00:00:00.000Z", "Team A"), []);
    const service = new TopicService(papers, radar);
    const topic = service.buildTopics(profileVersion, new Date("2026-07-17T12:00:00.000Z"))[0];

    expect(service.getTopicDetail(topic.id, 7).papers.map((paper) => paper.id)).toEqual(["p1"]);
  });
});
