import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import type { ResearchTopic } from "../../shared/radar";
import { TopicRadar } from "./TopicRadar";

const topic: ResearchTopic = {
  id: "topic-1", profileVersion: 1, kind: "stable", label: "spectroscopy", status: "rising",
  confidence: 0.9, paperCount7d: 5, highRelevanceCount: 3, baselineChange: 0.5,
  representativePaperIds: ["p1"], activeTeams: ["Team A", "Team B"], summary: "Five recent papers.",
  updatedAt: "2026-07-17T08:00:00.000Z",
};

it("selects a topic to filter the daily list", async () => {
  const onSelect = vi.fn();
  render(<TopicRadar topics={[topic]} selectedId={undefined} onSelect={onSelect} labels={{
    title: "主题雷达", stable: "稳定主题", emerging: "新兴主题", papers: "篇",
  }} />);

  await userEvent.click(screen.getByRole("button", { name: /spectroscopy/ }));

  expect(onSelect).toHaveBeenCalledWith("topic-1");
  expect(screen.getByText("Five recent papers.")).toBeVisible();
});
