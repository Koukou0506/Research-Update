import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Paper } from "../../shared/contracts";
import { RadarRepository } from "../db/radarRepository";
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
    const radar = new RadarRepository(sourceDatabase, () => new Date("2026-07-17T08:00:00.000Z"));
    const profile = radar.confirmProfile("I study archived astronomy results.", [
      { kind: "topic", value: "archived astronomy", weight: 1 },
    ]);
    radar.saveFeedback({ paperId: paper.id, relevance: "relevant", reason: null, undone: false });
    radar.saveDailySelection({ date: "2026-07-17", profileVersion: profile.version, paperIds: [paper.id], mode: "rule-only", createdAt: "2026-07-17T08:00:00.000Z" });
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

  it("exports schema v2 radar data without environment credentials", () => {
    const previous = process.env.AI_API_KEY;
    process.env.AI_API_KEY = "must-not-be-exported";
    try {
      const entries = unzipSync(new MigrationService(source).exportArchive());
      const manifest = JSON.parse(strFromU8(entries["manifest.json"])) as { exportVersion: number; schemaVersion: number };
      const serialized = strFromU8(entries["data.json"]);

      expect(manifest).toMatchObject({ exportVersion: 2, schemaVersion: 2 });
      expect(serialized).toContain("researchProfiles");
      expect(serialized).toContain("dailySelections");
      expect(serialized).not.toContain("must-not-be-exported");
    } finally {
      if (previous === undefined) delete process.env.AI_API_KEY;
      else process.env.AI_API_KEY = previous;
    }
  });

  it("restores a schema v1 archive with empty radar data", () => {
    const archive = new MigrationService(source).exportArchive();
    const entries = unzipSync(archive);
    const manifest = JSON.parse(strFromU8(entries["manifest.json"])) as { exportVersion: number; schemaVersion: number };
    manifest.exportVersion = 1;
    manifest.schemaVersion = 1;
    const data = JSON.parse(strFromU8(entries["data.json"])) as Record<string, unknown>;
    for (const key of ["researchProfiles", "profileFacets", "paperAiAnalyses", "paperScores", "researchTopics", "paperTopicMatches", "paperFeedback", "dailySelections"]) {
      delete data[key];
    }
    data.schemaMetadata = [{ key: "schema_version", value: "1" }];
    const legacy = zipSync({ ...entries, "manifest.json": strToU8(JSON.stringify(manifest)), "data.json": strToU8(JSON.stringify(data)) });

    const preview = new MigrationService(target).restoreArchive(legacy);

    expect(preview).toMatchObject({ exportVersion: 1, schemaVersion: 1, papers: 1 });
    expect(target.exportSnapshot()).toMatchObject({ researchProfiles: [], paperFeedback: [], dailySelections: [] });
    expect(targetDatabase.prepare("SELECT value FROM schema_metadata WHERE key = 'schema_version'").pluck().get()).toBe("2");
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
    manifest.exportVersion = 99;
    const unsupported = zipSync({ ...entries, "manifest.json": strToU8(JSON.stringify(manifest)) });

    expect(() => new MigrationService(target).previewArchive(unsupported)).toThrow("Unsupported archive version");
  });
});
