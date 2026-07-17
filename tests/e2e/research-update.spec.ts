import { expect, test } from "@playwright/test";

test("works without ADS and restores a complete exported archive", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "RESEARCH UPDATE" })).toBeVisible();
  await expect(page.getByText("ADS 未配置")).toBeVisible();

  await page.getByRole("searchbox").fill("fast radio burst");
  await page.getByRole("button", { name: "搜索", exact: true }).click();
  await expect(page.getByText("Fixture fast radio burst discovery")).toBeVisible();
  await page.getByRole("button", { name: "保存为关注词" }).click();
  await expect(page.getByRole("button", { name: "fast radio burst" })).toBeVisible();

  await page.getByRole("button", { name: "数据迁移" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出 ZIP" }).click();
  const download = await downloadPromise;
  const archivePath = await download.path();
  expect(archivePath).not.toBeNull();

  await page.reload();
  await page.getByRole("button", { name: "删除" }).click();
  await expect(page.getByRole("button", { name: "fast radio burst" })).toHaveCount(0);
  await page.getByRole("button", { name: "数据迁移" }).click();
  await page.locator('input[type="file"]').setInputFiles(archivePath!);
  await page.getByRole("button", { name: "预览" }).click();
  await expect(page.getByText(/Searches: 1 · Papers: 1 · Favorites: 0/)).toBeVisible();
  await page.getByRole("button", { name: "确认恢复" }).click();

  await expect(page.getByRole("button", { name: "fast radio burst" })).toBeVisible();
});
