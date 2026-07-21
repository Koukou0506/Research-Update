import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import type { DailyRadarView } from "../../shared/radar";
import { DailySelection } from "./DailySelection";

const view: DailyRadarView = {
  selection: { date: "2026-07-17", profileVersion: 1, paperIds: ["p1"], mode: "hybrid", createdAt: "2026-07-17" },
  papers: [{
    id: "p1", title: "A spectroscopy result", abstract: "Fixed abstract", authors: ["Ada"],
    publishedAt: "2026-07-17T00:00:00.000Z", journal: "ApJ", doi: null, arxivId: "2607.00001",
    bibcode: null, citationCount: 1, sources: ["arxiv"], sourceUrls: { arxiv: "https://arxiv.org/abs/2607.00001" },
    matchedSearchIds: [], favorite: false, read: false,
  }],
  scores: [{
    paperId: "p1", profileVersion: 1, rule: 50, semantic: 90, feedback: 50, final: 71.5, mode: "hybrid",
    evidence: [{ kind: "method", facet: "spectroscopy", contribution: 25 }], createdAt: "2026-07-17",
  }],
  analyses: [{
    paperId: "p1", cacheKey: "cache", profileVersion: 1, semanticScore: 90, topics: ["spectroscopy"],
    reason: "The method matches your profile.", emergingTopicCandidates: [], confidence: 0.9, recommend: true,
    providerBaseUrl: "https://example.test/v1", model: "test", schemaVersion: 1, createdAt: "2026-07-17",
  }],
};

it("shows explanations and records structured irrelevant feedback", async () => {
  const user = userEvent.setup();
  const onFeedback = vi.fn(async () => undefined);
  render(<DailySelection view={view} onFeedback={onFeedback} labels={{
    title: "每日精选", ruleOnly: "规则模式", why: "为什么推荐", relevant: "很相关", irrelevant: "不相关",
    confirmReason: "确认原因", reasonLabel: "不相关原因", wrongTopic: "主题不符", wrongMethod: "研究方法不符",
    wrongObject: "对象不符", tooBroad: "过于宽泛", alreadyKnown: "已经了解", abstract: "摘要", empty: "暂无论文",
  }} />);

  expect(screen.getByText("The method matches your profile.")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "不相关" }));
  await user.selectOptions(screen.getByRole("combobox", { name: "不相关原因" }), "wrong-method");
  await user.click(screen.getByRole("button", { name: "确认原因" }));

  expect(onFeedback).toHaveBeenCalledWith("p1", { relevance: "irrelevant", reason: "wrong-method" });
});
