import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Paper, SavedSearch } from "../shared/contracts";
import type { DailyRadarView, ResearchProfile, ResearchTopic } from "../shared/radar";
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

const profile: ResearchProfile = { id: "profile-1", text: "I study spectroscopy.", version: 1, active: true, createdAt: "2026-07-17" };
const topic: ResearchTopic = {
  id: "topic-1", profileVersion: 1, kind: "stable", label: "spectroscopy", status: "rising", confidence: 0.9,
  paperCount7d: 1, highRelevanceCount: 1, baselineChange: 0.5, representativePaperIds: [paper.id],
  activeTeams: ["Ada Astronomer"], summary: "One recent paper.", updatedAt: "2026-07-17",
};
const dailyView: DailyRadarView = {
  selection: { date: "2026-07-17", profileVersion: 1, paperIds: [paper.id], mode: "hybrid", createdAt: "2026-07-17" },
  papers: [paper],
  scores: [{ paperId: paper.id, profileVersion: 1, rule: 50, semantic: 90, feedback: 50, final: 71.5, mode: "hybrid", evidence: [], createdAt: "2026-07-17" }],
  analyses: [{ paperId: paper.id, cacheKey: "cache", profileVersion: 1, semanticScore: 90, topics: ["spectroscopy"],
    reason: "The method matches your profile.", emergingTopicCandidates: [], confidence: 0.9, recommend: true,
    providerBaseUrl: "https://example.test/v1", model: "test", schemaVersion: 1, createdAt: "2026-07-17" }],
};

const fakeApi = (profileAvailable = true): ResearchApi => {
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
    getProfile: vi.fn(async () => ({ profile: profileAvailable ? profile : null, facets: profileAvailable ? [{ id: "f1", profileId: profile.id, kind: "method" as const, value: "spectroscopy", weight: 1 }] : [] })),
    previewProfile: vi.fn(async () => [{ kind: "method" as const, value: "spectroscopy", weight: 1 }]),
    confirmProfile: vi.fn(async (text, facets) => ({ profile: { ...profile, text }, facets })),
    getDailyRadar: vi.fn(async (_forceRefresh = false) => dailyView),
    listTopics: vi.fn(async () => [topic]),
    getTopicDetail: vi.fn(async () => ({ topic, papers: [paper] })),
    recordFeedback: vi.fn(async () => undefined),
    undoFeedback: vi.fn(async () => undefined),
    getAiStatus: vi.fn(async () => ({ available: true, baseUrl: "https://example.test/v1", model: "test", message: null })),
  };
};

afterEach(() => cleanup());

describe("Research Update dashboard", () => {
  it("shows cached papers, switches language, searches, and saves a temporary query", async () => {
    const user = userEvent.setup();
    render(<App api={fakeApi()} />);

    expect(await screen.findByText(paper.title)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "EN" }));
    await user.click(screen.getByRole("button", { name: "All papers" }));
    expect(screen.getByText("Following")).toBeVisible();

    await user.type(screen.getByRole("searchbox"), "cosmic dawn");
    await user.click(screen.getByRole("button", { name: "Search" }));
    await user.click(await screen.findByRole("button", { name: "Save search" }));

    expect(await screen.findByText("cosmic dawn")).toBeVisible();
  });

  it("shows profile setup before the radar when no profile is confirmed", async () => {
    render(<App api={fakeApi(false)} />);

    expect(await screen.findByRole("heading", { name: "建立研究画像" })).toBeVisible();
  });

  it("loads the topic radar and grounded daily explanation as the primary view", async () => {
    render(<App api={fakeApi()} />);

    expect(await screen.findByRole("heading", { name: "主题雷达" })).toBeVisible();
    expect(screen.getByText("The method matches your profile.")).toBeVisible();
  });

  it("updates favorite state optimistically", async () => {
    const user = userEvent.setup();
    const api = fakeApi();
    render(<App api={api} />);

    await user.click(await screen.findByRole("button", { name: "收藏" }));

    expect(api.updatePaperState).toHaveBeenCalledWith(paper.id, { favorite: true });
    expect(screen.getByRole("button", { name: "取消收藏" })).toBeVisible();
  });
  it("shows a selected topic's representative papers outside the daily selection", async () => {
    const user = userEvent.setup();
    const topicPaper = { ...paper, id: "topic-paper", title: "A topic paper outside today's selection" };
    const selectedTopic = { ...topic, label: "microlensing", representativePaperIds: [topicPaper.id] };
    const api = fakeApi();
    api.listTopics = vi.fn(async () => [selectedTopic]);
    const getTopicDetail = vi.fn(async () => ({ topic: selectedTopic, papers: [topicPaper] }));
    Object.assign(api, { getTopicDetail });
    render(<App api={api} />);

    await user.click(await screen.findByRole("button", { name: /microlensing/ }));

    expect(await screen.findByText(topicPaper.title)).toBeVisible();
    expect(getTopicDetail).toHaveBeenCalledWith(selectedTopic.id, 7);
  });

  it("recomputes the radar after startup and manual paper refreshes", async () => {
    const user = userEvent.setup();
    const api = fakeApi();
    render(<App api={api} />);

    await waitFor(() => expect(api.getDailyRadar).toHaveBeenCalledWith(true));
    const forcedBeforeManual = vi.mocked(api.getDailyRadar).mock.calls.filter(([force]) => force === true).length;
    await user.click(screen.getByRole("button", { name: "EN" }));
    await user.click(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() => expect(vi.mocked(api.getDailyRadar).mock.calls.filter(([force]) => force === true)).toHaveLength(forcedBeforeManual + 1));
  });

  it("keeps the cached radar when startup recomputation fails", async () => {
    const api = fakeApi();
    api.getDailyRadar = vi.fn(async (forceRefresh = false) => {
      if (forceRefresh) throw new Error("radar unavailable");
      return dailyView;
    });
    render(<App api={api} />);

    expect(await screen.findByText("The method matches your profile.")).toBeVisible();
    await waitFor(() => expect(api.getDailyRadar).toHaveBeenCalledWith(true));
    await waitFor(() => expect(document.querySelector(".search-bar button[type='button']")).toBeEnabled());
  });
});
