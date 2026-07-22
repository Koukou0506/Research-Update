import { createHash } from "node:crypto";

import { z } from "zod";

import { profileFacetInputSchema } from "../../../shared/radar";
import type { AiProvider, AnalysisPaper, AnalysisRequest, PaperAnalysisInput } from "./types";

type ProviderConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs?: number;
  batchSize?: number;
};

const analysisSchema = z.object({
  paperId: z.string().min(1),
  semanticScore: z.number().min(0).max(100),
  topics: z.array(z.string().min(1)).max(10),
  reason: z.string().min(1).max(1_000),
  emergingTopicCandidates: z.array(z.string().min(1)).max(10),
  confidence: z.number().min(0).max(1),
  recommend: z.boolean(),
});

const analysisPayloadSchema = z.object({ analyses: z.array(analysisSchema) });
const facetPayloadSchema = z.object({ facets: z.array(profileFacetInputSchema).min(1).max(30) });
const envelopeSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string() }) })).min(1),
});

const normalizeBaseUrl = (value: string): string => value.replace(/\/+$/, "");

const parseJsonContent = (content: string): unknown => {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return JSON.parse(fenced?.[1] ?? trimmed);
};

export const buildAnalysisCacheKey = (input: {
  paperId: string;
  contentHash: string;
  profileVersion: number;
  schemaVersion: number;
  baseUrl: string;
  model: string;
}): string => createHash("sha256").update(JSON.stringify({
  paperId: input.paperId,
  contentHash: input.contentHash,
  profileVersion: input.profileVersion,
  schemaVersion: input.schemaVersion,
  baseUrl: normalizeBaseUrl(input.baseUrl),
  model: input.model,
})).digest("hex");

const buildBody = (model: string, request: AnalysisRequest, papers: AnalysisPaper[]) => ({
  model,
  response_format: { type: "json_object" },
  messages: [
    {
      role: "system",
      content: "Return only a JSON object with an analyses array. Return exactly one item per supplied paper. Each item must contain: paperId (the exact supplied paper ID), semanticScore (number from 0 to 100), topics (array of at most 10 non-empty strings), reason (non-empty string grounded in the profile and paper metadata), emergingTopicCandidates (array of at most 10 non-empty strings), confidence (number from 0 to 1), and recommend (boolean). Do not score any other papers or wrap the JSON in Markdown.",
    },
    {
      role: "user",
      content: JSON.stringify({ profile: request.profile, papers }),
    },
  ],
});

export const createOpenAiCompatibleProvider = (
  config: ProviderConfig,
  fetcher: typeof fetch = fetch,
): AiProvider => {
  const baseUrl = normalizeBaseUrl(config.baseUrl);
  const batchSize = Math.max(1, Math.min(10, config.batchSize ?? 10));
  const timeoutMs = config.timeoutMs ?? 30_000;

  const requestCompletion = async (body: Record<string, unknown>): Promise<string> => {
    let response: Response | null = null;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        response = await fetcher(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${config.apiKey}` },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch {
        if (attempt === 3) throw new Error("AI request failed");
        continue;
      }

      if (response.ok) break;
      const transient = response.status === 429 || response.status >= 500;
      if (!transient || attempt === 3) throw new Error(`AI request failed (${response.status})`);
    }

    try {
      const envelope = envelopeSchema.parse(await response?.json());
      return envelope.choices[0].message.content;
    } catch {
      throw new Error("Invalid AI response");
    }
  };

  const requestBatch = async (request: AnalysisRequest, papers: AnalysisPaper[]): Promise<PaperAnalysisInput[]> => {
    const content = await requestCompletion(buildBody(config.model, request, papers));
    try {
      const parsed = analysisPayloadSchema.parse(parseJsonContent(content));
      const expectedIds = new Set(papers.map((paper) => paper.id));
      if (parsed.analyses.length !== papers.length || parsed.analyses.some((item) => !expectedIds.has(item.paperId))) {
        throw new Error("paper mismatch");
      }
      return parsed.analyses;
    } catch {
      throw new Error("Invalid AI response");
    }
  };

  return {
    async status() {
      return { available: true, baseUrl, model: config.model, message: null };
    },
    async previewProfile(text) {
      try {
        const content = await requestCompletion({
          model: config.model,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: "Return JSON with a facets array. Allowed kinds: topic, object, method, data-type, author, exclude. Weight is 0 to 1.",
            },
            { role: "user", content: text },
          ],
        });
        return facetPayloadSchema.parse(parseJsonContent(content)).facets;
      } catch (error) {
        if (error instanceof Error && error.message.startsWith("AI request failed")) throw error;
        throw new Error("Invalid AI response");
      }
    },
    async analyze(request) {
      const analyses: PaperAnalysisInput[] = [];
      for (let index = 0; index < request.papers.length; index += batchSize) {
        analyses.push(...await requestBatch(request, request.papers.slice(index, index + batchSize)));
      }
      return analyses;
    },
  };
};
