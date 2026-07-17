import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Paper, SavedSearch } from "../shared/contracts";
import { App } from "./App";
import type { ResearchApi } from "./api";

const paper: Paper = {
  id: "doi:10.1000/jwst",
  title: "JWST constraints on warm-Neptune chemistry",
  abstract: "A cached abstract for dashboard testing.",
  authors: ["Ada Astronomer"],
  publishedAt: "2026-07-17T00:00:00.000Z",
  journal: "ApJ",
  doi: "10.1000/jwst",
  arxivId: "2607.00004",
  bibcode: null,
  citationCount: 4,
  sources: ["arxiv"],
  sourceUrls: { arxiv: "https://arxiv.org/abs/2607.00004" },
  matchedSearchIds: [],
  favorite: false,
  read: false,
};

const fakeApi = (): ResearchApi => {
  const searches: SavedSearch[] = [];
  return {
    getStatus: vi.fn(async () => ({ arxiv: { available: true }, ads: { available: false } })),
    listSearches: vi.fn(async () => [...searches]),
    createSearch: vi.fn(async (query) => {
      const search = { id: "s1", query, enabled: true, createdAt: "2026-07-17", updatedAt: "2026-07-17" };
      searches.push(search);
      return search;
    }),
    updateSearch: vi.fn(),
    deleteSearch: vi.fn(),
    listPapers: vi.fn(async () => [paper]),
    temporarySearch: vi.fn(async () => ({ papers: [paper], sources: { arxiv: { state: "ok" as const, count: 1, message: null } } })),
    refresh: vi.fn(async () => ({ sources: { arxiv: { state: "ok" as const, count: 1, message: null } } })),
    updatePaperState: vi.fn(async () => undefined),
    getSettings: vi.fn(async () => ({ language: "zh" as const })),
    updateSettings: vi.fn(async (language) => ({ language })),
    exportArchive: vi.fn(async () => new Blob()),
    previewArchive: vi.fn(),
    restoreArchive: vi.fn(),
  };
};

describe("Research Update dashboard", () => {
  it("shows cached papers, switches language, searches, and saves a temporary query", async () => {
    const user = userEvent.setup();
    render(<App api={fakeApi()} />);

    expect(await screen.findByText(paper.title)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "EN" }));
    expect(screen.getByText("Following")).toBeVisible();

    await user.type(screen.getByRole("searchbox"), "cosmic dawn");
    await user.click(screen.getByRole("button", { name: "Search" }));
    await user.click(await screen.findByRole("button", { name: "Save search" }));

    expect(await screen.findByText("cosmic dawn")).toBeVisible();
  });

  it("updates favorite state optimistically", async () => {
    const user = userEvent.setup();
    const api = fakeApi();
    render(<App api={api} />);

    await user.click(await screen.findByRole("button", { name: "收藏" }));

    expect(api.updatePaperState).toHaveBeenCalledWith(paper.id, { favorite: true });
    expect(screen.getByRole("button", { name: "取消收藏" })).toBeVisible();
  });
});
