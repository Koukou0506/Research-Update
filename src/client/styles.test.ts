import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("approved dashboard visual system", () => {
  it("defines the paper palette, serif paper titles, and mobile breakpoint", () => {
    const css = readFileSync("src/client/styles.css", "utf8");

    expect(css).toContain("--paper:");
    expect(css).toContain("font-family: Georgia");
    expect(css).toContain("@media (max-width: 899px)");
    expect(css).toContain("grid-template-columns: repeat(3, minmax(0, 1fr))");
    expect(css).toContain("prefers-reduced-motion: reduce");
  });
});
