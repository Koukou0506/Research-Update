import { XMLParser } from "fast-xml-parser";

import { fetchWithRetry } from "./request";
import type { FetchLike, SourceAdapter, SourcePaper, SourceSearchInput } from "./types";

const endpoint = "https://export.arxiv.org/api/query";
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", removeNSPrefix: true });

const arrayOf = <T>(value: T | T[] | undefined): T[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];

const cleanText = (value: unknown): string => String(value ?? "").replace(/\s+/g, " ").trim();

const parseEntry = (entry: Record<string, unknown>): SourcePaper => {
  const rawId = cleanText(entry.id);
  const arxivId = rawId.split("/abs/").at(-1)?.replace(/v\d+$/i, "") ?? null;
  const links = arrayOf(entry.link as Record<string, unknown> | Record<string, unknown>[] | undefined);
  const alternate = links.find((link) => link["@_rel"] === "alternate")?.["@_href"];
  const authors = arrayOf(entry.author as { name?: unknown } | Array<{ name?: unknown }> | undefined).map(
    (author) => cleanText(author.name),
  );
  return {
    source: "arxiv",
    title: cleanText(entry.title),
    abstract: cleanText(entry.summary),
    authors,
    publishedAt: new Date(cleanText(entry.published)).toISOString(),
    updatedAt: entry.updated ? new Date(cleanText(entry.updated)).toISOString() : null,
    journal: entry.journal_ref ? cleanText(entry.journal_ref) : null,
    doi: entry.doi ? cleanText(entry.doi).toLowerCase() : null,
    arxivId,
    bibcode: null,
    citationCount: null,
    url: cleanText(alternate || rawId),
  };
};

class ArxivAdapter implements SourceAdapter {
  readonly source = "arxiv" as const;
  private lastStart = 0;

  constructor(
    private readonly fetcher: FetchLike,
    private readonly minimumIntervalMs: number,
  ) {}

  async search(input: SourceSearchInput): Promise<SourcePaper[]> {
    const delay = Math.max(0, this.lastStart + this.minimumIntervalMs - Date.now());
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    this.lastStart = Date.now();

    const query = input.since
      ? `all:${input.query} AND submittedDate:[${input.since.replace(/\D/g, "").slice(0, 14)} TO 99991231235959]`
      : `all:${input.query}`;
    const params = new URLSearchParams({
      search_query: query,
      start: "0",
      max_results: String(input.limit),
      sortBy: "submittedDate",
      sortOrder: "descending",
    });
    const response = await fetchWithRetry({ source: this.source, fetcher: this.fetcher, input: `${endpoint}?${params}` });
    const document = parser.parse(await response.text()) as { feed?: { entry?: Record<string, unknown> | Record<string, unknown>[] } };
    return arrayOf(document.feed?.entry).map(parseEntry);
  }
}

export const createArxivAdapter = (
  fetcher: FetchLike = fetch,
  minimumIntervalMs = 3_000,
): SourceAdapter => new ArxivAdapter(fetcher, minimumIntervalMs);
