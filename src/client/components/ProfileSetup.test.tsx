import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import { ProfileSetup } from "./ProfileSetup";

it("previews facets and requires explicit confirmation", async () => {
  const user = userEvent.setup();
  const api = {
    previewProfile: vi.fn(async () => [{ kind: "method" as const, value: "spectroscopy", weight: 1 }]),
    confirmProfile: vi.fn(async (text, facets) => ({
      profile: { id: "profile-1", text, version: 1, active: true, createdAt: "2026-07-17" }, facets,
    })),
  };
  const onConfirmed = vi.fn();
  render(<ProfileSetup api={api} onConfirmed={onConfirmed} labels={{
    title: "建立研究画像", description: "研究方向", parse: "解析画像", confirm: "确认画像", addFacet: "添加维度",
  }} />);

  await user.type(screen.getByRole("textbox", { name: "研究方向" }), "I study warm Neptune atmosphere spectroscopy.");
  await user.click(screen.getByRole("button", { name: "解析画像" }));
  expect(await screen.findByDisplayValue("spectroscopy")).toBeVisible();
  expect(onConfirmed).not.toHaveBeenCalled();

  await user.click(screen.getByRole("button", { name: "确认画像" }));
  expect(api.confirmProfile).toHaveBeenCalled();
  expect(onConfirmed).toHaveBeenCalled();
});
