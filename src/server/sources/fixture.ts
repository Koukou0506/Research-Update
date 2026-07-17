import type { SourceAdapter } from "./types";

export const createFixtureAdapter = (): SourceAdapter => ({
  source: "arxiv",
  async search() {
    return [{
      source: "arxiv",
      title: "Fixture fast radio burst discovery",
      abstract: "A deterministic astronomy record used only by end-to-end tests.",
      authors: ["Ada Astronomer", "Bo Cosmologist"],
      publishedAt: "2026-07-17T00:00:00.000Z",
      updatedAt: null,
      journal: "The Astrophysical Journal",
      doi: "10.1000/e2e-fixture",
      arxivId: "2607.99999",
      bibcode: null,
      citationCount: null,
      url: "https://arxiv.org/abs/2607.99999",
    }];
  },
});
