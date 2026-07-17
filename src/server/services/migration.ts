import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { z } from "zod";

import type { DatabaseSnapshot, Repository } from "../db/repository";

const MAX_COMPRESSED_BYTES = 25 * 1024 * 1024;
const MAX_EXPANDED_BYTES = 200 * 1024 * 1024;
const MAX_PAPERS = 100_000;
const MAX_SEARCHES = 1_000;
const allowedEntries = new Set(["manifest.json", "data.json"]);

const rowArray = z.array(z.record(z.string(), z.unknown()));
const snapshotSchema = z.object({
  savedSearches: rowArray,
  papers: rowArray,
  paperSources: rowArray,
  paperSearchMatches: rowArray,
  paperState: rowArray,
  refreshRuns: rowArray,
  settings: rowArray,
  schemaMetadata: rowArray,
});
const manifestSchema = z.object({
  exportVersion: z.number().int(),
  schemaVersion: z.number().int(),
  createdAt: z.string(),
  counts: z.object({ searches: z.number().int(), papers: z.number().int(), favorites: z.number().int() }),
});

export type MigrationPreview = {
  exportVersion: 1;
  schemaVersion: 1;
  createdAt: string;
  searches: number;
  papers: number;
  favorites: number;
};

type ParsedArchive = { preview: MigrationPreview; snapshot: DatabaseSnapshot };

const validateReferences = (snapshot: DatabaseSnapshot): void => {
  const paperIds = new Set(snapshot.papers.map((row) => String(row.id)));
  const searchIds = new Set(snapshot.savedSearches.map((row) => String(row.id)));
  const valid =
    snapshot.paperSources.every((row) => paperIds.has(String(row.paper_id))) &&
    snapshot.paperState.every((row) => paperIds.has(String(row.paper_id))) &&
    snapshot.paperSearchMatches.every((row) => paperIds.has(String(row.paper_id)) && searchIds.has(String(row.search_id))) &&
    snapshot.refreshRuns.every((row) => searchIds.has(String(row.search_id)));
  if (!valid) throw new Error("Invalid archive references");
};

export class MigrationService {
  constructor(
    private readonly repository: Repository,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  exportArchive(): Uint8Array {
    const snapshot = this.repository.exportSnapshot();
    const favorites = snapshot.paperState.filter((row) => Number(row.favorite) === 1).length;
    const manifest = {
      exportVersion: 1,
      schemaVersion: 1,
      createdAt: this.clock().toISOString(),
      counts: { searches: snapshot.savedSearches.length, papers: snapshot.papers.length, favorites },
    };
    return zipSync({
      "manifest.json": strToU8(JSON.stringify(manifest)),
      "data.json": strToU8(JSON.stringify(snapshot)),
    });
  }

  previewArchive(bytes: Uint8Array): MigrationPreview {
    return this.parseArchive(bytes).preview;
  }

  restoreArchive(bytes: Uint8Array): MigrationPreview {
    const parsed = this.parseArchive(bytes);
    this.repository.replaceAll(parsed.snapshot);
    const restored = this.repository.exportSnapshot();
    if (restored.papers.length !== parsed.preview.papers || restored.savedSearches.length !== parsed.preview.searches) {
      throw new Error("Archive restore verification failed");
    }
    return parsed.preview;
  }

  private parseArchive(bytes: Uint8Array): ParsedArchive {
    if (bytes.byteLength > MAX_COMPRESSED_BYTES) throw new Error("Archive exceeds compressed size limit");
    const entries = unzipSync(bytes);
    const names = Object.keys(entries);
    if (names.some((name) => !allowedEntries.has(name)) || !entries["manifest.json"] || !entries["data.json"]) {
      throw new Error("Archive contains unsupported entries");
    }
    const expandedBytes = Object.values(entries).reduce((total, entry) => total + entry.byteLength, 0);
    if (expandedBytes > MAX_EXPANDED_BYTES) throw new Error("Archive exceeds expanded size limit");

    const manifest = manifestSchema.parse(JSON.parse(strFromU8(entries["manifest.json"])));
    if (manifest.exportVersion !== 1 || manifest.schemaVersion !== 1) throw new Error("Unsupported archive version");
    const snapshot = snapshotSchema.parse(JSON.parse(strFromU8(entries["data.json"]))) as DatabaseSnapshot;
    if (snapshot.papers.length > MAX_PAPERS || snapshot.savedSearches.length > MAX_SEARCHES) {
      throw new Error("Archive exceeds record limit");
    }
    validateReferences(snapshot);
    const favorites = snapshot.paperState.filter((row) => Number(row.favorite) === 1).length;
    if (
      manifest.counts.searches !== snapshot.savedSearches.length ||
      manifest.counts.papers !== snapshot.papers.length ||
      manifest.counts.favorites !== favorites
    ) {
      throw new Error("Archive manifest counts do not match data");
    }
    return {
      preview: {
        exportVersion: 1,
        schemaVersion: 1,
        createdAt: manifest.createdAt,
        searches: manifest.counts.searches,
        papers: manifest.counts.papers,
        favorites,
      },
      snapshot,
    };
  }
}
