import { test, expect } from "@playwright/test";

test("development user can browse core DevQuest flows", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Complete quests.")).toBeVisible();
  await page.getByRole("link", { name: /Continue with GitHub/i }).first().click();
  await page.getByRole("link", { name: /Continue with GitHub/i }).click();
  await expect(page.getByText("GitHub profile imported")).toBeVisible();
  await page.getByRole("link", { name: /Open dashboard/i }).click();
  await expect(page.getByText("Welcome back, kai-builds.")).toBeVisible();
  await page.goto("/app/api-keys");
  await expect(page.getByText("API keys")).toBeVisible();
  await page.goto("/app/playground");
  await expect(page.getByText("Playground")).toBeVisible();
});
