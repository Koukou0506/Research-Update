import type { Paper } from "../../shared/contracts";
import type { PaperFeedback, ProfileFacet, ScoreEvidence } from "../../shared/radar";

export type RuleScoreResult = {
  score: number;
  feedbackScore: number;
  excluded: boolean;
  evidence: ScoreEvidence[];
};

export type CombinedScore = {
  rule: number;
  semantic: number | null;
  feedback: number;
  final: number;
  mode: "hybrid" | "rule-only";
};

const facetPoints: Record<Exclude<ProfileFacet["kind"], "exclude">, number> = {
  topic: 25,
  object: 25,
  method: 25,
  "data-type": 15,
  author: 20,
};

const clamp = (value: number): number => Math.max(0, Math.min(100, value));
const round = (value: number): number => Math.round(value * 100) / 100;
const normalize = (value: string): string => value.normalize("NFKC").trim().toLocaleLowerCase("en-US");

const searchableText = (paper: Paper): string => normalize([
  paper.title,
  paper.abstract,
  paper.authors.join(" "),
  paper.journal ?? "",
].join(" "));

const scoreFeedback = (paper: Paper, feedback: PaperFeedback[]): number => {
  const explicit = [...feedback]
    .filter((item) => item.paperId === paper.id && !item.undone)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
  if (explicit) return explicit.relevance === "relevant" ? 100 : 0;
  return clamp(50 + (paper.favorite ? 15 : 0) + (paper.read ? 5 : 0));
};

export const scorePaper = (paper: Paper, facets: ProfileFacet[], feedback: PaperFeedback[]): RuleScoreResult => {
  const text = searchableText(paper);
  const exclusion = facets.find((facet) => facet.kind === "exclude" && text.includes(normalize(facet.value)));
  if (exclusion) {
    return {
      score: 0,
      feedbackScore: scoreFeedback(paper, feedback),
      excluded: true,
      evidence: [{ kind: "exclude", facet: exclusion.value, contribution: -100 }],
    };
  }

  const evidence = facets.flatMap((facet): ScoreEvidence[] => {
    if (facet.kind === "exclude" || !text.includes(normalize(facet.value))) return [];
    return [{ kind: facet.kind, facet: facet.value, contribution: round(facetPoints[facet.kind] * facet.weight) }];
  });

  return {
    score: clamp(round(evidence.reduce((total, item) => total + item.contribution, 0))),
    feedbackScore: scoreFeedback(paper, feedback),
    excluded: false,
    evidence,
  };
};

export const combineScores = (input: { rule: number; semantic: number | null; feedback: number }): CombinedScore => {
  const presentWeight = input.semantic === null ? 0.65 : 1;
  const weighted = input.rule * 0.5 + (input.semantic ?? 0) * 0.35 + input.feedback * 0.15;
  return {
    ...input,
    final: round(clamp(weighted / presentWeight)),
    mode: input.semantic === null ? "rule-only" : "hybrid",
  };
};
