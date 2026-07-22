import { describe, expect, it, vi } from "vitest";

import { buildAnalysisCacheKey, createOpenAiCompatibleProvider } from "./openaiCompatible";
import type { AnalysisRequest } from "./types";

const config = {
  baseUrl: "https://api.example.test/v1/",
  apiKey: "secret-key",
  model: "radar-model",
  timeoutMs: 1_000,
};

const request: AnalysisRequest = {
  profile: {
    text: "I study warm Neptune atmospheres with spectroscopy.",
    version: 2,
    facets: [{ kind: "method", value: "spectroscopy", weight: 1 }],
  },
  papers: [
    { id: "p1", title: "Paper one", abstract: "Spectroscopy result", authors: ["Ada"] },
    { id: "p2", title: "Paper two", abstract: "Retrieval result", authors: ["Bea"] },
  ],
};

const analysis = (paperId: string) => ({
  paperId,
  semanticScore: 91,
  topics: ["spectroscopy"],
  reason: "The method matches the profile.",
  emergingTopicCandidates: [],
  confidence: 0.9,
  recommend: true,
});

const openAiResponse = (paperIds: string[]) => new Response(JSON.stringify({
  choices: [{ message: { content: JSON.stringify({ analyses: paperIds.map(analysis) }) } }],
}), { status: 200, headers: { "content-type": "application/json" } });

describe("OpenAI-compatible provider", () => {
  it("parses a research description into validated facets", async () => {
    const response = new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        facets: [{ kind: "method", value: "spectroscopy", weight: 1 }],
      }) } }],
    }), { status: 200 });
    const provider = createOpenAiCompatibleProvider(config, vi.fn<typeof fetch>().mockResolvedValue(response));

    await expect(provider.previewProfile("I study spectroscopy.")).resolves.toEqual([
      { kind: "method", value: "spectroscopy", weight: 1 },
    ]);
  });

  it("parses validated facets returned inside a JSON code fence", async () => {
    const response = new Response(JSON.stringify({
      choices: [{ message: { content: "```json\n{\"facets\":[{\"kind\":\"method\",\"value\":\"spectroscopy\",\"weight\":1}]}\n```" } }],
    }), { status: 200 });
    const provider = createOpenAiCompatibleProvider(config, vi.fn<typeof fetch>().mockResolvedValue(response));

    await expect(provider.previewProfile("I study spectroscopy.")).resolves.toEqual([
      { kind: "method", value: "spectroscopy", weight: 1 },
    ]);
  });

  it("batches papers, validates structured JSON, and keeps the key out of status", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(openAiResponse(["p1"]))
      .mockResolvedValueOnce(openAiResponse(["p2"]));
    const provider = createOpenAiCompatibleProvider({ ...config, batchSize: 1 }, fetcher);

    await expect(provider.analyze(request)).resolves.toEqual([analysis("p1"), analysis("p2")]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0][0]).toBe("https://api.example.test/v1/chat/completions");
    expect((fetcher.mock.calls[0][1]?.headers as Record<string, string>).authorization).toBe("Bearer secret-key");
    expect(JSON.stringify(await provider.status())).not.toContain(config.apiKey);
  });

  it("requests every validated analysis field and exact supplied paper IDs", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(openAiResponse(["p1", "p2"]));

    await createOpenAiCompatibleProvider(config, fetcher).analyze(request);

    const body = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    const systemPrompt = body.messages[0].content;
    for (const field of ["paperId", "semanticScore", "topics", "reason", "emergingTopicCandidates", "confidence", "recommend"]) {
      expect(systemPrompt).toContain(field);
    }
    expect(systemPrompt).toContain("exact supplied paper ID");
  });

  it("parses paper analyses returned inside a JSON code fence", async () => {
    const response = new Response(JSON.stringify({
      choices: [{ message: { content: `\`\`\`json\n${JSON.stringify({ analyses: [analysis("p1"), analysis("p2")] })}\n\`\`\`` } }],
    }), { status: 200 });
    const provider = createOpenAiCompatibleProvider(config, vi.fn<typeof fetch>().mockResolvedValue(response));

    await expect(provider.analyze(request)).resolves.toEqual([analysis("p1"), analysis("p2")]);
  });

  it("retries transient responses at most three times", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("rate limited", { status: 429 }))
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(openAiResponse(["p1", "p2"]));

    await expect(createOpenAiCompatibleProvider(config, fetcher).analyze(request)).resolves.toHaveLength(2);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("does not retry terminal client errors", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("bad request", { status: 400 }));

    await expect(createOpenAiCompatibleProvider(config, fetcher).analyze(request)).rejects.toThrow("AI request failed (400)");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed model output", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ analyses: [{ paperId: "p1", semanticScore: 500 }] }) } }],
    }), { status: 200 }));

    await expect(createOpenAiCompatibleProvider(config, fetcher).analyze(request)).rejects.toThrow("Invalid AI response");
  });

  it("builds a deterministic cache key from content, profile, schema, endpoint, and model", () => {
    const base = { paperId: "p1", contentHash: "abc", profileVersion: 2, schemaVersion: 1, baseUrl: config.baseUrl, model: config.model };

    expect(buildAnalysisCacheKey(base)).toBe(buildAnalysisCacheKey(base));
    expect(buildAnalysisCacheKey({ ...base, profileVersion: 3 })).not.toBe(buildAnalysisCacheKey(base));
    expect(buildAnalysisCacheKey({ ...base, model: "other" })).not.toBe(buildAnalysisCacheKey(base));
  });
});
