import { fetchWithRetry } from "./request";
import type { FetchLike, SourceAdapter, SourcePaper, SourceSearchInput } from "./types";

const endpoint = "https://api.adsabs.harvard.edu/v1/search/query";

type AdsDocument = {
  bibcode: string;
  title?: string[];
  abstract?: string;
  author?: string[];
  pubdate?: string;
  pub?: string;
  doi?: string[];
  identifier?: string[];
  citation_count?: number;
};

const normalizeAdsDate = (value = "1970-01-01"): string => {
  const parts = value.split("-");
  const year = parts[0] || "1970";
  const month = parts[1] && parts[1] !== "00" ? parts[1] : "01";
  const day = parts[2] && parts[2] !== "00" ? parts[2] : "01";
  return new Date(`${year}-${month}-${day}T00:00:00Z`).toISOString();
};

const toSourcePaper = (document: AdsDocument): SourcePaper => ({
  source: "ads",
  title: document.title?.[0]?.replace(/\s+/g, " ").trim() ?? "Untitled",
  abstract: document.abstract?.replace(/\s+/g, " ").trim() ?? "",
  authors: document.author ?? [],
  publishedAt: normalizeAdsDate(document.pubdate),
  updatedAt: null,
  journal: document.pub ?? null,
  doi: document.doi?.[0]?.toLowerCase() ?? null,
  arxivId: document.identifier?.find((identifier) => /^arXiv:/i.test(identifier))?.replace(/^arXiv:/i, "") ?? null,
  bibcode: document.bibcode,
  citationCount: document.citation_count ?? null,
  url: `https://ui.adsabs.harvard.edu/abs/${encodeURIComponent(document.bibcode)}/abstract`,
});

class AdsAdapter implements SourceAdapter {
  readonly source = "ads" as const;

  constructor(
    private readonly token: string,
    private readonly fetcher: FetchLike,
  ) {}

  async search(input: SourceSearchInput): Promise<SourcePaper[]> {
    const phrase = input.query.replace(/"/g, "\\\"");
    const query = input.since ? `abs:"${phrase}" entdate:[${input.since} TO NOW]` : `abs:"${phrase}"`;
    const params = new URLSearchParams({
      q: query,
      rows: String(input.limit),
      sort: "date desc",
      fl: "bibcode,title,abstract,author,pubdate,pub,doi,identifier,citation_count",
    });
    const response = await fetchWithRetry({
      source: this.source,
      fetcher: this.fetcher,
      input: `${endpoint}?${params}`,
      init: { headers: { Authorization: `Bearer ${this.token}` } },
    });
    const payload = (await response.json()) as { response?: { docs?: AdsDocument[] } };
    return (payload.response?.docs ?? []).map(toSourcePaper);
  }
}

export function createAdsAdapter(token: undefined, fetcher?: FetchLike): null;
export function createAdsAdapter(token: string, fetcher?: FetchLike): SourceAdapter;
export function createAdsAdapter(token: string | undefined, fetcher: FetchLike = fetch): SourceAdapter | null {
  return token?.trim() ? new AdsAdapter(token.trim(), fetcher) : null;
}
