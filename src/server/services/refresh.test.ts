import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Repository } from "../db/repository";
import { openDatabase } from "../db/schema";
import { SourceError, type SourceAdapter, type SourcePaper } from "../sources/types";
import { RefreshService } from "./refresh";

const paper: SourcePaper = {
  source: "arxiv",
  title: "A fresh arXiv paper",
  abstract: "Fixed service test data.",
  authors: ["Ada Astronomer"],
  publishedAt: "2026-07-17T00:00:00.000Z",
  updatedAt: null,
  journal: null,
  doi: "10.1000/fresh",
  arxivId: "2607.00002",
  bibcode: null,
  citationCount: null,
  url: "https://arxiv.org/abs/2607.00002",
};

describe("RefreshService", () => {
  const now = "2026-07-17T08:00:00.000Z";
  let database: ReturnType<typeof openDatabase>;
  let repository: Repository;

  beforeEach(() => {
    database = openDatabase(":memory:");
    repository = new Repository(database);
  });

  afterEach(() => database.close());

  it("commits arXiv results when ADS fails and advances only arXiv", async () => {
    const search = repository.createSearch("fast radio burst");
    const arxiv: SourceAdapter = { source: "arxiv", search: async () => [paper] };
    const ads: SourceAdapter = {
      source: "ads",
      search: async () => { throw new SourceError("ads", "ADS unavailable", true); },
    };
    const service = new RefreshService(repository, [arxiv, ads], () => new Date(now));

    const result = await service.refreshSaved();

    expect(result.sources).toMatchObject({ arxiv: { state: "ok", count: 1 }, ads: { state: "error" } });
    expect(repository.listPapers({ sort: "latest", state: "all" })).toHaveLength(1);
    expect(repository.getRefreshMarker(search.id, "arxiv")).toBe(now);
    expect(repository.getRefreshMarker(search.id, "ads")).toBeNull();
  });

  it("uses a 24-hour overlap from the last successful source marker", async () => {
    const search = repository.createSearch("cosmic dawn");
    repository.setRefreshResult(search.id, "arxiv", { status: "ok", attemptedAt: "2026-07-10T08:00:00.000Z" });
    let since: string | undefined;
    const arxiv: SourceAdapter = { source: "arxiv", search: async (input) => (since = input.since, []) };

    await new RefreshService(repository, [arxiv], () => new Date(now)).refreshSaved();

    expect(since).toBe("2026-07-09T08:00:00.000Z");
  });
});
