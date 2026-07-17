import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";

import { Repository } from "./db/repository";
import { openDatabase } from "./db/schema";
import { createApp } from "./app";
import { RefreshService } from "./services/refresh";
import { SearchService } from "./services/search";

describe("local API", () => {
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
});
