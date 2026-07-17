import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { createArxivAdapter } from "./arxiv";

const fixture = readFileSync(resolve("tests/fixtures/arxiv-response.xml"), "utf8");

describe("arXiv adapter", () => {
  it("parses Atom entries and requests the newest 50 records", async () => {
    let requestedUrl = "";
    const adapter = createArxivAdapter(async (input) => {
      requestedUrl = String(input);
      return new Response(fixture, { status: 200 });
    }, 0);

    const papers = await adapter.search({ query: '"fast radio burst"', limit: 50 });

    expect(papers[0]).toMatchObject({
      source: "arxiv",
      arxivId: "2607.00001",
      doi: "10.1000/frb",
      authors: ["Ada Astronomer", "Bo Cosmologist"],
    });
    expect(requestedUrl).toContain("max_results=50");
    expect(requestedUrl).toContain("sortBy=submittedDate");
  });
});
