import { describe, expect, it } from "vitest";

import { feedQuerySchema } from "./contracts";

describe("feedQuerySchema", () => {
  it("rejects unsupported sort values so server and client stay aligned", () => {
    expect(feedQuerySchema.safeParse({ sort: "score" }).success).toBe(false);
  });
});
