import { describe, expect, it } from "vitest";

import type { SourcePaper } from "../sources/types";
import { canonicalPaperId, mergeSourcePapers } from "./merge";

const sourcePaper = (overrides: Partial<SourcePaper> = {}): SourcePaper => ({
  source: "arxiv",
  title: "JWST constraints on a warm Neptune",
  abstract: "An arXiv abstract.",
  authors: ["Ada Astronomer"],
  publishedAt: "2026-07-15T00:00:00.000Z",
  updatedAt: "2026-07-16T00:00:00.000Z",
  journal: null,
  doi: "10.1000/jwst",
  arxivId: "2607.00001v2",
  bibcode: null,
  citationCount: null,
  url: "https://arxiv.org/abs/2607.00001v2",
  ...overrides,
});

describe("paper merge", () => {
  it.each([
    ["DOI", { doi: "10.1000/jwst", arxivId: null }, { doi: "HTTPS://DOI.ORG/10.1000/JWST", arxivId: null }],
    ["arXiv ID", { doi: null, arxivId: "2607.00001v3" }, { doi: null, arxivId: "2607.00001" }],
    ["ADS bibcode", { doi: null, arxivId: null, bibcode: "2026ApJ...1A" }, { doi: null, arxivId: null, bibcode: "2026ApJ...1A" }],
  ])("merges duplicate records by %s", (_label, leftIds, rightIds) => {
    const records = [
      sourcePaper(leftIds),
      sourcePaper({ ...rightIds, source: "ads", citationCount: 12, url: "https://ui.adsabs.harvard.edu/abs/x" }),
    ];

    const merged = mergeSourcePapers(records);

    expect(merged).toHaveLength(1);
    expect(merged[0].sources.sort()).toEqual(["ads", "arxiv"]);
    expect(merged[0].citationCount).toBe(12);
  });

  it("falls back to normalized title and publication year", () => {
    const records = [
      sourcePaper({ doi: null, arxivId: null, title: "Cosmic Dawn: First Light!" }),
      sourcePaper({ doi: null, arxivId: null, bibcode: null, source: "ads", title: " cosmic dawn — first light ", url: "https://ads/x" }),
    ];

    expect(mergeSourcePapers(records)).toHaveLength(1);
  });

  it("uses normalized DOI as the canonical identity", () => {
    expect(canonicalPaperId(sourcePaper({ doi: "https://doi.org/10.1000/JWST" }))).toBe("doi:10.1000/jwst");
  });
});
