import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AiProvider } from "./ai/types";
import { RadarRepository } from "../db/radarRepository";
import { openDatabase } from "../db/schema";
import { ProfileService } from "./profileService";

const providerWithPreview = (previewProfile: AiProvider["previewProfile"]): AiProvider => ({
  previewProfile,
  status: vi.fn(async () => ({ available: true, baseUrl: "https://example.test/v1", model: "test", message: null })),
  analyze: vi.fn(async () => []),
});

describe("ProfileService", () => {
  let database: ReturnType<typeof openDatabase>;
  let radar: RadarRepository;

  beforeEach(() => {
    database = openDatabase(":memory:");
    radar = new RadarRepository(database, () => new Date("2026-07-17T08:00:00.000Z"));
  });

  afterEach(() => database.close());

  it("returns AI-proposed facets without activating them", async () => {
    const provider = providerWithPreview(
      vi.fn(async () => [{ kind: "method" as const, value: "spectroscopy", weight: 1 }]),
    );
    const service = new ProfileService(radar, provider);

    await expect(service.preview("I study warm Neptune atmospheres with spectroscopy.")).resolves.toEqual([
      { kind: "method", value: "spectroscopy", weight: 1 },
    ]);
    expect(service.getActive()).toBeNull();
  });

  it("normalizes and deduplicates facets before confirmation", () => {
    const service = new ProfileService(radar);
    const profile = service.confirm("I study warm Neptune atmospheres with spectroscopy.", [
      { kind: "method", value: " Spectroscopy ", weight: 1 },
      { kind: "method", value: "spectroscopy", weight: 0.8 },
    ]);

    expect(profile.version).toBe(1);
    expect(radar.listFacets(profile.id)).toEqual([
      expect.objectContaining({ kind: "method", value: "Spectroscopy", weight: 1 }),
    ]);
    expect(service.getActiveState()?.facets).toEqual([
      expect.objectContaining({ kind: "method", value: "Spectroscopy", weight: 1 }),
    ]);
  });

  it("falls back to one editable literal topic when AI is absent or fails", async () => {
    const missing = new ProfileService(radar);
    await expect(missing.preview("warm Neptune atmosphere spectroscopy")).resolves.toEqual([
      { kind: "topic", value: "warm Neptune atmosphere spectroscopy", weight: 1 },
    ]);

    const failing = new ProfileService(radar, providerWithPreview(vi.fn(async () => { throw new Error("offline"); })));
    await expect(failing.preview("warm Neptune atmosphere spectroscopy")).resolves.toEqual([
      { kind: "topic", value: "warm Neptune atmosphere spectroscopy", weight: 1 },
    ]);
  });

  it("rejects descriptions outside 10 to 5000 characters", async () => {
    const service = new ProfileService(radar);

    await expect(service.preview("short")).rejects.toThrow("Research profile must contain 10 to 5000 characters");
    expect(() => service.confirm("x".repeat(5_001), [{ kind: "topic", value: "astronomy", weight: 1 }]))
      .toThrow("Research profile must contain 10 to 5000 characters");
  });
});
