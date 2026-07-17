import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { createAdsAdapter } from "./ads";

const fixture = readFileSync(resolve("tests/fixtures/ads-response.json"), "utf8");

describe("ADS adapter", () => {
  it("sends the token only in the authorization header and parses results", async () => {
    let request: Request | undefined;
    const adapter = createAdsAdapter("secret", async (input, init) => {
      request = new Request(input, init);
      return new Response(fixture, { status: 200, headers: { "content-type": "application/json" } });
    });

    const papers = await adapter.search({ query: "galaxy evolution", limit: 50 });

    expect(request?.headers.get("authorization")).toBe("Bearer secret");
    expect(request?.url).not.toContain("secret");
    expect(papers[0]).toMatchObject({
      source: "ads",
      bibcode: "2026ApJ...999....1A",
      arxivId: "2607.00001",
      citationCount: 17,
    });
  });

  it("returns no adapter when the token is missing", () => {
    expect(createAdsAdapter(undefined)).toBeNull();
  });
});
