import { profileFacetInputSchema, type ProfileFacetInput, type ResearchProfile } from "../../shared/radar";
import type { RadarRepository } from "../db/radarRepository";
import type { AiProvider } from "./ai/types";

const normalizeText = (text: string): string => {
  const normalized = text.trim();
  if (normalized.length < 10 || normalized.length > 5_000) {
    throw new Error("Research profile must contain 10 to 5000 characters");
  }
  return normalized;
};

const normalizeFacets = (facets: ProfileFacetInput[]): ProfileFacetInput[] => {
  const unique = new Map<string, ProfileFacetInput>();
  for (const input of facets) {
    const facet = profileFacetInputSchema.parse({ ...input, value: input.value.trim() });
    const key = `${facet.kind}:${facet.value.toLocaleLowerCase("en-US")}`;
    const existing = unique.get(key);
    if (!existing || facet.weight > existing.weight) unique.set(key, { ...facet, value: existing?.value ?? facet.value });
  }
  if (unique.size === 0) throw new Error("At least one research facet is required");
  return [...unique.values()];
};

export class ProfileService {
  constructor(
    private readonly repository: RadarRepository,
    private readonly ai?: AiProvider,
  ) {}

  getActive(): ResearchProfile | null {
    return this.repository.getActiveProfile();
  }

  async preview(text: string): Promise<ProfileFacetInput[]> {
    const normalized = normalizeText(text);
    if (this.ai) {
      try {
        return normalizeFacets(await this.ai.previewProfile(normalized));
      } catch {
        // The original description remains editable when AI parsing is unavailable.
      }
    }
    return [{ kind: "topic", value: normalized, weight: 1 }];
  }

  confirm(text: string, facets: ProfileFacetInput[]): ResearchProfile {
    return this.repository.confirmProfile(normalizeText(text), normalizeFacets(facets));
  }
}
