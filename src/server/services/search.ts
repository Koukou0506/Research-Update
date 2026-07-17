import type { SourceName } from "../../shared/contracts";
import type { Repository } from "../db/repository";
import { mergeSourcePapers } from "../papers/merge";
import type { SourceAdapter, SourcePaper } from "../sources/types";
import type { RefreshSourceSummary } from "./refresh";

export class SearchService {
  constructor(
    private readonly repository: Repository,
    private readonly adapters: SourceAdapter[],
  ) {}

  async temporarySearch(query: string): Promise<{
    papers: ReturnType<typeof mergeSourcePapers>;
    sources: Partial<Record<SourceName, RefreshSourceSummary>>;
  }> {
    const records: SourcePaper[] = [];
    const sources: Partial<Record<SourceName, RefreshSourceSummary>> = {};
    await Promise.all(this.adapters.map(async (adapter) => {
      try {
        const found = await adapter.search({ query, limit: 50 });
        records.push(...found);
        sources[adapter.source] = { state: "ok", count: found.length, message: null };
      } catch (error) {
        sources[adapter.source] = {
          state: "error",
          count: 0,
          message: error instanceof Error ? error.message : `${adapter.source} request failed`,
        };
      }
    }));
    const papers = mergeSourcePapers(records);
    if (papers.length > 0) this.repository.upsertPapers(papers);
    return { papers, sources };
  }
}
