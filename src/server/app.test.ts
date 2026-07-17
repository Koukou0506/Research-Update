import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Response as SuperAgentResponse } from "superagent";

import { Repository } from "./db/repository";
import { RadarRepository } from "./db/radarRepository";
import { openDatabase } from "./db/schema";
import { createApp } from "./app";
import type { AiProvider, AnalysisRequest } from "./radar/ai/types";
import { ProfileService } from "./radar/profileService";
import { RadarService } from "./radar/radarService";
import { TopicService } from "./radar/topicService";
import { MigrationService } from "./services/migration";
import { RefreshService } from "./services/refresh";
import { SearchService } from "./services/search";

describe("local API", () => {
  const parseBinary = (response: SuperAgentResponse, callback: (error: Error | null, body: Buffer) => void) => {
    const chunks: Buffer[] = [];
    response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    response.on("end", () => callback(null, Buffer.concat(chunks)));
    response.on("error", callback);
  };
  let database: ReturnType<typeof openDatabase>;
  let repository: Repository;

  beforeEach(() => {
    database = openDatabase(":memory:");
    repository = new Repository(database);
  });

  afterEach(() => database.close());

  it("reports ADS as unavailable without exposing configuration secrets", async () => {
    const app = createApp({
      repository,
      search: new SearchService(repository, []),
      refresh: new RefreshService(repository, []),
      configuredSources: ["arxiv"],
    });

    const response = await request(app).get("/api/status").expect(200);

    expect(response.body.data.sources.ads).toEqual({ available: false });
    expect(JSON.stringify(response.body)).not.toContain("token");
  });

  it("creates and lists a saved search", async () => {
    const app = createApp({
      repository,
      search: new SearchService(repository, []),
      refresh: new RefreshService(repository, []),
      configuredSources: [],
    });

    await request(app).post("/api/searches").send({ query: "exoplanet atmosphere" }).expect(201);
    const response = await request(app).get("/api/searches").expect(200);

    expect(response.body.data[0].query).toBe("exoplanet atmosphere");
  });

  it("rejects an empty temporary search at the server boundary", async () => {
    const app = createApp({
      repository,
      search: new SearchService(repository, []),
      refresh: new RefreshService(repository, []),
      configuredSources: [],
    });

    const response = await request(app).post("/api/search").send({ query: "  " }).expect(400);
    expect(response.body.error.code).toBe("INVALID_REQUEST");
  });

  it("exports an archive and previews it before restore", async () => {
    repository.createSearch("galaxy evolution");
    const app = createApp({
      repository,
      search: new SearchService(repository, []),
      refresh: new RefreshService(repository, []),
      migration: new MigrationService(repository, () => new Date("2026-07-17T08:00:00.000Z")),
      configuredSources: [],
    });

    const exported = await request(app).get("/api/migration/export").buffer(true).parse(parseBinary).expect(200);
    const preview = await request(app)
      .post("/api/migration/preview")
      .attach("archive", Buffer.from(exported.body), "research-update.zip")
      .expect(200);

    expect(preview.body.data).toMatchObject({ searches: 1, papers: 0, favorites: 0 });
  });

  it("exposes profile, daily radar, topic, feedback, and secret-safe AI endpoints", async () => {
    repository.upsertPapers([{
      id: "p1", title: "Spectroscopy result", abstract: "Warm Neptune atmosphere", authors: ["Team A"],
      publishedAt: "2026-07-17T00:00:00.000Z", journal: "ApJ", doi: null, arxivId: "2607.00001",
      bibcode: null, citationCount: 1, sources: ["arxiv"], sourceUrls: { arxiv: "https://arxiv.org/abs/2607.00001" },
      matchedSearchIds: [], favorite: false, read: false,
    }]);
    const radarRepository = new RadarRepository(database, () => new Date("2026-07-17T08:00:00.000Z"));
    const ai: AiProvider = {
      status: async () => ({ available: true, baseUrl: "https://example.test/v1", model: "test", message: null }),
      previewProfile: async () => [{ kind: "method", value: "spectroscopy", weight: 1 }],
      analyze: async (analysisRequest: AnalysisRequest) => analysisRequest.papers.map((paper) => ({
        paperId: paper.id, semanticScore: 90, topics: ["spectroscopy"], reason: "Method match.",
        emergingTopicCandidates: [], confidence: 0.9, recommend: true,
      })),
    };
    const profile = new ProfileService(radarRepository, ai);
    const radar = new RadarService(repository, radarRepository, ai, () => new Date("2026-07-17T08:00:00.000Z"));
    const topics = new TopicService(repository, radarRepository);
    const app = createApp({ repository, search: new SearchService(repository, []), refresh: new RefreshService(repository, []),
      configuredSources: [], profile, radar, topics, ai });

    await request(app).post("/api/profile/preview").send({ text: "I study warm Neptune spectroscopy." }).expect(200);
    await request(app).put("/api/profile").send({ text: "I study warm Neptune spectroscopy.", facets: [
      { kind: "method", value: "spectroscopy", weight: 1 },
    ] }).expect(200);
    const daily = await request(app).get("/api/radar/daily").expect(200);
    expect(daily.body.data.papers[0].id).toBe("p1");
    await request(app).get("/api/radar/topics").expect(200);
    await request(app).post("/api/papers/p1/feedback").send({ relevance: "irrelevant", reason: "wrong-method" }).expect(200);
    const status = await request(app).get("/api/ai/status").expect(200);
    expect(JSON.stringify(status.body)).not.toContain("secret");
  });
});
