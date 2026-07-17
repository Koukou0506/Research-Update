import type { ProfileFacetInput } from "../../../shared/radar";

export type AnalysisPaper = {
  id: string;
  title: string;
  abstract: string;
  authors: string[];
};

export type AnalysisRequest = {
  profile: {
    text: string;
    version: number;
    facets: ProfileFacetInput[];
  };
  papers: AnalysisPaper[];
};

export type PaperAnalysisInput = {
  paperId: string;
  semanticScore: number;
  topics: string[];
  reason: string;
  emergingTopicCandidates: string[];
  confidence: number;
  recommend: boolean;
};

export interface AiProvider {
  status(): Promise<{ available: boolean; baseUrl: string; model: string; message: string | null }>;
  previewProfile(text: string): Promise<ProfileFacetInput[]>;
  analyze(request: AnalysisRequest): Promise<PaperAnalysisInput[]>;
}
