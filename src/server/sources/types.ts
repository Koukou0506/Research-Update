import type { SourceName } from "../../shared/contracts";

export type SourceSearchInput = {
  query: string;
  limit: 50;
  since?: string;
};

export type SourcePaper = {
  source: SourceName;
  title: string;
  abstract: string;
  authors: string[];
  publishedAt: string;
  updatedAt: string | null;
  journal: string | null;
  doi: string | null;
  arxivId: string | null;
  bibcode: string | null;
  citationCount: number | null;
  url: string;
};

export interface SourceAdapter {
  readonly source: SourceName;
  search(input: SourceSearchInput): Promise<SourcePaper[]>;
}

export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export class SourceError extends Error {
  constructor(
    readonly source: SourceName,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "SourceError";
  }
}
