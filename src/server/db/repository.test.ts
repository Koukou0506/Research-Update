import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Paper } from "../../shared/contracts";
import { openDatabase } from "./schema";
import { Repository } from "./repository";

const makePaper = (overrides: Partial<Paper> = {}): Paper => ({
  id: "doi:10.1000/example",
  title: "A useful astronomy paper",
  abstract: "Results from a fixed test record.",
  authors: ["Ada Astronomer"],
  publishedAt: "2026-07-17T00:00:00.000Z",
  journal: "ApJ",
  doi: "10.1000/example",
  arxivId: "2607.00001",
  bibcode: "2026ApJ...001A",
  citationCount: 3,
  sources: ["arxiv", "ads"],
  sourceUrls: {
    arxiv: "https://arxiv.org/abs/2607.00001",
    ads: "https://ui.adsabs.harvard.edu/abs/2026ApJ...001A/abstract",
  },
  matchedSearchIds: [],
  favorite: false,
  read: false,
  ...overrides,
});

describe("Repository", () => {
  let database: ReturnType<typeof openDatabase>;
  let repository: Repository;
  let searchId: string;

  beforeEach(() => {
    database = openDatabase(":memory:");
    repository = new Repository(database);
    searchId = repository.createSearch("exoplanet atmosphere").id;
  });

  afterEach(() => database.close());

  it("keeps a paper unique across repeated refreshes", () => {
    repository.upsertPapers([makePaper()], searchId);
    repository.upsertPapers([makePaper()], searchId);

    expect(repository.listPapers({ sort: "latest", state: "all" })).toHaveLength(1);
  });

  it("does not overwrite user state during metadata refresh", () => {
    repository.upsertPapers([makePaper()], searchId);
    repository.setPaperState("doi:10.1000/example", { favorite: true });
    repository.upsertPapers([makePaper({ favorite: false })], searchId);

    expect(repository.listPapers({ sort: "latest", state: "favorites" })[0].favorite).toBe(true);
  });
});
