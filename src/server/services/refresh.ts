import type { SourceName } from "../../shared/contracts";
import type { Repository } from "../db/repository";
import { mergeSourcePapers } from "../papers/merge";
import type { SourceAdapter, SourcePaper } from "../sources/types";

export type RefreshSourceSummary = {
  state: "ok" | "error";
  count: number;
  message: string | null;
};

export type RefreshSummary = {
  sources: Partial<Record<SourceName, RefreshSourceSummary>>;
};

export class RefreshService {
  constructor(
    private readonly repository: Repository,
    private readonly adapters: SourceAdapter[],
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async refreshSaved(searchIds?: string[]): Promise<RefreshSummary> {
    const selected = this.repository
      .listSearches()
      .filter((search) => search.enabled && (!searchIds || searchIds.includes(search.id)));
    const sources: Partial<Record<SourceName, RefreshSourceSummary>> = {};

    for (const search of selected) {
      const successfulRecords: SourcePaper[] = [];
      await Promise.all(this.adapters.map(async (adapter) => {
        const attemptedAt = this.clock().toISOString();
        const marker = this.repository.getRefreshMarker(search.id, adapter.source);
        const since = marker
          ? new Date(new Date(marker).getTime() - 24 * 60 * 60 * 1_000).toISOString()
          : undefined;
        try {
          const records = await adapter.search({ query: search.query, limit: 50, since });
          successfulRecords.push(...records);
          this.repository.setRefreshResult(search.id, adapter.source, { status: "ok", attemptedAt });
          const previous = sources[adapter.source];
          sources[adapter.source] = {
            state: previous?.state === "error" ? "error" : "ok",
            count: (previous?.count ?? 0) + records.length,
            message: previous?.message ?? null,
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : `${adapter.source} request failed`;
          this.repository.setRefreshResult(search.id, adapter.source, { status: "error", attemptedAt, message });
          sources[adapter.source] = {
            state: "error",
            count: sources[adapter.source]?.count ?? 0,
            message,
          };
        }
      }));

      if (successfulRecords.length > 0) {
        this.repository.upsertPapers(mergeSourcePapers(successfulRecords), search.id);
      }
    }

    return { sources };
  }
}
