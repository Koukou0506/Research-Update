import { describe, expect, it } from "vitest";

import type { Paper } from "../../shared/contracts";
import type { PaperFeedback, ProfileFacet } from "../../shared/radar";
import { combineScores, scorePaper } from "./ruleScore";

const paper: Paper = {
  id: "p1",
  title: "Atmospheric retrieval with high-resolution spectroscopy",
  abstract: "We retrieve warm Neptune atmospheric abundances from transit spectra.",
  authors: ["Ada Astronomer"],
  publishedAt: "2026-07-17T00:00:00.000Z",
  journal: "ApJ",
  doi: null,
  arxivId: "2607.00001",
  bibcode: null,
  citationCount: 3,
  sources: ["arxiv"],
  sourceUrls: { arxiv: "https://arxiv.org/abs/2607.00001" },
  matchedSearchIds: [],
  favorite: false,
  read: false,
};

const facets: ProfileFacet[] = [
  { id: "f1", profileId: "profile", kind: "method", value: "spectroscopy", weight: 1 },
  { id: "f2", profileId: "profile", kind: "object", value: "warm Neptune", weight: 1 },
];

describe("ruleScore", () => {
  it("rewards confirmed method and object matches with explicit evidence", () => {
    const result = scorePaper(paper, facets, []);

    expect(result.score).toBe(50);
    expect(result.excluded).toBe(false);
    expect(result.evidence).toEqual([
      { kind: "method", facet: "spectroscopy", contribution: 25 },
      { kind: "object", facet: "warm Neptune", contribution: 25 },
    ]);
  });

  it("short-circuits a confirmed exclusion", () => {
    const result = scorePaper(paper, [
      ...facets,
      { id: "f3", profileId: "profile", kind: "exclude", value: "transit spectra", weight: 1 },
    ], []);

    expect(result).toMatchObject({ score: 0, excluded: true });
    expect(result.evidence).toContainEqual({ kind: "exclude", facet: "transit spectra", contribution: -100 });
  });

  it("uses explicit feedback before weak favorite and read signals", () => {
    const feedback: PaperFeedback = {
      id: "fb1",
      paperId: paper.id,
      relevance: "irrelevant",
      reason: "wrong-method",
      undone: false,
      createdAt: "2026-07-17T08:00:00.000Z",
    };

    expect(scorePaper({ ...paper, favorite: true, read: true }, facets, [feedback]).feedbackScore).toBe(0);
    expect(scorePaper({ ...paper, favorite: true, read: true }, facets, [{ ...feedback, undone: true }]).feedbackScore).toBe(70);
  });

  it("combines hybrid scores and renormalizes when semantic analysis is absent", () => {
    expect(combineScores({ rule: 80, semantic: 90, feedback: 20 })).toEqual({
      rule: 80,
      semantic: 90,
      feedback: 20,
      final: 74.5,
      mode: "hybrid",
    });
    expect(combineScores({ rule: 80, semantic: null, feedback: 20 })).toEqual({
      rule: 80,
      semantic: null,
      feedback: 20,
      final: 66.15,
      mode: "rule-only",
    });
    expect(combineScores({ rule: -20, semantic: -20, feedback: -20 }).final).toBe(0);
    expect(combineScores({ rule: 120, semantic: 120, feedback: 120 }).final).toBe(100);
  });
});
