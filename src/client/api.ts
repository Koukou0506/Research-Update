import type { FeedQuery, Paper, SavedSearch, SourceName } from "../shared/contracts";
import type { DailyRadarView, PaperFeedback, ProfileFacet, ProfileFacetInput, ResearchProfile, ResearchTopic } from "../shared/radar";

export type SourceRun = { state: "ok" | "error"; count: number; message: string | null };
export type MigrationPreview = { exportVersion: 1; schemaVersion: 1; createdAt: string; searches: number; papers: number; favorites: number };

export interface ResearchApi {
  getStatus(): Promise<Record<SourceName, { available: boolean }>>;
  listSearches(): Promise<SavedSearch[]>;
  createSearch(query: string): Promise<SavedSearch>;
  updateSearch(id: string, patch: Partial<Pick<SavedSearch, "query" | "enabled">>): Promise<SavedSearch>;
  deleteSearch(id: string): Promise<void>;
  listPapers(query: FeedQuery): Promise<Paper[]>;
  temporarySearch(query: string): Promise<{ papers: Paper[]; sources: Partial<Record<SourceName, SourceRun>> }>;
  refresh(searchIds?: string[]): Promise<{ sources: Partial<Record<SourceName, SourceRun>> }>;
  updatePaperState(id: string, patch: Partial<Pick<Paper, "favorite" | "read">>): Promise<void>;
  getSettings(): Promise<{ language: "zh" | "en" }>;
  updateSettings(language: "zh" | "en"): Promise<{ language: "zh" | "en" }>;
  exportArchive(): Promise<Blob>;
  previewArchive(archive: File): Promise<MigrationPreview>;
  restoreArchive(archive: File): Promise<MigrationPreview>;
  getProfile(): Promise<{ profile: ResearchProfile | null; facets: ProfileFacet[] }>;
  previewProfile(text: string): Promise<ProfileFacetInput[]>;
  confirmProfile(text: string, facets: ProfileFacetInput[]): Promise<{ profile: ResearchProfile; facets: ProfileFacet[] }>;
  getDailyRadar(): Promise<DailyRadarView>;
  listTopics(): Promise<ResearchTopic[]>;
  recordFeedback(paperId: string, input: { relevance: "relevant" | "irrelevant"; reason: PaperFeedback["reason"] }): Promise<void>;
  undoFeedback(paperId: string): Promise<void>;
  getAiStatus(): Promise<{ available: boolean; baseUrl: string; model: string; message: string | null }>;
}

const requestJson = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  const payload = await response.json() as { data?: T; error?: { message: string } };
  if (!response.ok || payload.data === undefined) throw new Error(payload.error?.message ?? "Request failed");
  return payload.data;
};

const archiveRequest = async (url: string, archive: File): Promise<MigrationPreview> => {
  const form = new FormData();
  form.append("archive", archive);
  const response = await fetch(url, { method: "POST", body: form });
  const payload = await response.json() as { data?: MigrationPreview; error?: { message: string } };
  if (!response.ok || !payload.data) throw new Error(payload.error?.message ?? "Archive request failed");
  return payload.data;
};

export const api: ResearchApi = {
  async getStatus() {
    return (await requestJson<{ sources: Record<SourceName, { available: boolean }> }>("/api/status")).sources;
  },
  listSearches: () => requestJson("/api/searches"),
  createSearch: (query) => requestJson("/api/searches", { method: "POST", body: JSON.stringify({ query }) }),
  updateSearch: (id, patch) => requestJson(`/api/searches/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  async deleteSearch(id) {
    const response = await fetch(`/api/searches/${id}`, { method: "DELETE" });
    if (!response.ok) throw new Error("Delete failed");
  },
  listPapers(query) {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => value !== undefined && params.set(key, String(value)));
    return requestJson(`/api/papers?${params}`);
  },
  temporarySearch: (query) => requestJson("/api/search", { method: "POST", body: JSON.stringify({ query }) }),
  refresh: (searchIds) => requestJson("/api/refresh", { method: "POST", body: JSON.stringify({ searchIds }) }),
  async updatePaperState(id, patch) {
    await requestJson(`/api/papers/${encodeURIComponent(id)}/state`, { method: "PATCH", body: JSON.stringify(patch) });
  },
  getSettings: () => requestJson("/api/settings"),
  updateSettings: (language) => requestJson("/api/settings", { method: "PATCH", body: JSON.stringify({ language }) }),
  async exportArchive() {
    const response = await fetch("/api/migration/export");
    if (!response.ok) throw new Error("Export failed");
    return response.blob();
  },
  previewArchive: (archive) => archiveRequest("/api/migration/preview", archive),
  restoreArchive: (archive) => archiveRequest("/api/migration/restore", archive),
  getProfile: () => requestJson("/api/profile"),
  async previewProfile(text) {
    return (await requestJson<{ facets: ProfileFacetInput[] }>("/api/profile/preview", { method: "POST", body: JSON.stringify({ text }) })).facets;
  },
  confirmProfile: (text, facets) => requestJson("/api/profile", { method: "PUT", body: JSON.stringify({ text, facets }) }),
  getDailyRadar: () => requestJson("/api/radar/daily"),
  listTopics: () => requestJson("/api/radar/topics"),
  async recordFeedback(paperId, input) {
    await requestJson(`/api/papers/${encodeURIComponent(paperId)}/feedback`, { method: "POST", body: JSON.stringify(input) });
  },
  async undoFeedback(paperId) {
    await requestJson(`/api/papers/${encodeURIComponent(paperId)}/feedback`, { method: "DELETE" });
  },
  getAiStatus: () => requestJson("/api/ai/status"),
};
