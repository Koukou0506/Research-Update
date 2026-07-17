import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Paper } from "../../shared/contracts";
import { Repository } from "../db/repository";
import { openDatabase } from "../db/schema";
import { MigrationService } from "./migration";

const paper: Paper = {
  id: "doi:10.1000/archive",
  title: "Archived astronomy result",
  abstract: "Cached abstract",
  authors: ["Ada Astronomer"],
  publishedAt: "2026-07-17T00:00:00.000Z",
  journal: "ApJ",
  doi: "10.1000/archive",
  arxivId: "2607.00003",
  bibcode: "2026ApJ...3A",
  citationCount: 9,
  sources: ["arxiv", "ads"],
  sourceUrls: { arxiv: "https://arxiv.org/abs/2607.00003", ads: "https://ads/x" },
  matchedSearchIds: [],
  favorite: false,
  read: false,
};

describe("MigrationService", () => {
  let sourceDatabase: ReturnType<typeof openDatabase>;
  let targetDatabase: ReturnType<typeof openDatabase>;
  let source: Repository;
  let target: Repository;

  beforeEach(() => {
    sourceDatabase = openDatabase(":memory:");
    targetDatabase = openDatabase(":memory:");
    source = new Repository(sourceDatabase);
    target = new Repository(targetDatabase);
    const search = source.createSearch("cosmic dawn");
    source.upsertPapers([paper], search.id);
    source.setPaperState(paper.id, { favorite: true, read: true });
    source.setSetting("language", "en");
    source.setRefreshResult(search.id, "arxiv", { status: "ok", attemptedAt: "2026-07-17T08:00:00.000Z" });
  });

  afterEach(() => {
    sourceDatabase.close();
    targetDatabase.close();
  });

  it("round-trips searches, paper cache, refresh history and user state", () => {
    const archive = new MigrationService(source).exportArchive();
    const preview = new MigrationService(target).restoreArchive(archive);

    expect(preview).toMatchObject({ searches: 1, papers: 1, favorites: 1 });
    expect(target.exportSnapshot()).toEqual(source.exportSnapshot());
  });

  it("leaves current data unchanged when an archive reference is invalid", () => {
    target.createSearch("keep me");
    const before = target.exportSnapshot();
    const archive = new MigrationService(source).exportArchive();
    const entries = unzipSync(archive);
    const data = JSON.parse(strFromU8(entries["data.json"])) as ReturnType<Repository["exportSnapshot"]>;
    data.paperSearchMatches[0].search_id = "missing-search";
    const invalid = zipSync({ ...entries, "data.json": strToU8(JSON.stringify(data)) });

    expect(() => new MigrationService(target).restoreArchive(invalid)).toThrow("Invalid archive references");
    expect(target.exportSnapshot()).toEqual(before);
  });

  it("rejects unsupported export versions during preview", () => {
    const archive = new MigrationService(source).exportArchive();
    const entries = unzipSync(archive);
    const manifest = JSON.parse(strFromU8(entries["manifest.json"])) as { exportVersion: number };
    manifest.exportVersion = 2;
    const unsupported = zipSync({ ...entries, "manifest.json": strToU8(JSON.stringify(manifest)) });

    expect(() => new MigrationService(target).previewArchive(unsupported)).toThrow("Unsupported archive version");
  });
});
