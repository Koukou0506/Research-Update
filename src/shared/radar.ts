import { z } from "zod";

export const facetKindSchema = z.enum(["topic", "object", "method", "data-type", "author", "exclude"]);

export const profileFacetInputSchema = z.object({
  kind: facetKindSchema,
  value: z.string().trim().min(1).max(500),
  weight: z.number().min(0).max(1),
});

export const paperFeedbackInputSchema = z.object({
  relevance: z.enum(["relevant", "irrelevant"]),
  reason: z.enum(["wrong-topic", "wrong-method", "wrong-object", "too-broad", "already-known"]).nullable(),
});

export type ProfileFacetInput = z.infer<typeof profileFacetInputSchema>;

export type ResearchProfile = {
  id: string;
  text: string;
  version: number;
  active: boolean;
  createdAt: string;
};

export type ProfileFacet = ProfileFacetInput & {
  id: string;
  profileId: string;
};

export type ScoreEvidence = {
  kind: string;
  facet: string;
  contribution: number;
};

export type PaperScore = {
  paperId: string;
  profileVersion: number;
  rule: number;
  semantic: number | null;
  feedback: number;
  final: number;
  mode: "hybrid" | "rule-only";
  evidence: ScoreEvidence[];
  createdAt: string;
};

export type PaperAnalysis = {
  paperId: string;
  cacheKey: string;
  profileVersion: number;
  semanticScore: number;
  topics: string[];
  reason: string;
  emergingTopicCandidates: string[];
  confidence: number;
  recommend: boolean;
  providerBaseUrl: string;
  model: string;
  schemaVersion: number;
  createdAt: string;
};

export type ResearchTopic = {
  id: string;
  profileVersion: number;
  kind: "stable" | "emerging";
  label: string;
  status: "stable" | "rising" | "emerging" | "cooling" | "signal";
  confidence: number;
  paperCount7d: number;
  highRelevanceCount: number;
  baselineChange: number;
  representativePaperIds: string[];
  activeTeams: string[];
  summary: string;
  updatedAt: string;
};

export type PaperFeedbackInput = {
  paperId: string;
  relevance: "relevant" | "irrelevant";
  reason: "wrong-topic" | "wrong-method" | "wrong-object" | "too-broad" | "already-known" | null;
  undone: boolean;
};

export type PaperFeedback = PaperFeedbackInput & {
  id: string;
  createdAt: string;
};

export type DailySelection = {
  date: string;
  profileVersion: number;
  paperIds: string[];
  mode: "hybrid" | "rule-only";
  createdAt: string;
};
