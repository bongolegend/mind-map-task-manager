import { expect, test, type Page } from "@playwright/test";

async function resetStore(page: Page) {
  const res = await page.request.post("/api/store/reset");
  expect(res.ok()).toBeTruthy();
}

/** List row buttons include a child-count badge in the accessible name. */
function listItem(page: Page, title: string) {
  return page.getByRole("button", { name: new RegExp(`^${escapeRegExp(title)}`) });
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function openFirstThesis(page: Page) {
  await listItem(page, "AI infra commoditizes").click();
  await expect(page.getByText("Thesis", { exact: true })).toBeVisible();
}

test.describe("Thinking Map", () => {
  test.beforeEach(async ({ page }) => {
    await resetStore(page);
    await page.goto("/");
    await expect(page.getByText("Workspace")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: /^Theses/ })).toBeVisible();
  });

  test("drills from root → thesis → bet with section labels", async ({
    page,
  }) => {
    await openFirstThesis(page);
    await expect(page.getByRole("button", { name: /^Bets/ })).toBeVisible();
    await expect(listItem(page, "Long inference pure-plays")).toBeVisible();

    await listItem(page, "Long inference pure-plays").click();
    await expect(page.getByText("Bet", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Tasks/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^People/ })).toBeVisible();
  });

  test("sets due date in metadata and persists after reload", async ({
    page,
  }) => {
    await openFirstThesis(page);
    await listItem(page, "Long inference pure-plays").click();
    await expect(page.getByText("Bet", { exact: true })).toBeVisible();

    // Single-click focus title expands details (chevron is in the accessible name)
    await page
      .getByRole("button", { name: /^Long inference pure-plays/ })
      .click();
    await expect(page.getByText("Due", { exact: true })).toBeVisible();

    await page.locator('input[type="date"]').fill("2026-08-15");
    await expect(page.locator('input[type="date"]')).toHaveValue("2026-08-15");

    await page.reload();
    await openFirstThesis(page);
    await listItem(page, "Long inference pure-plays").click();
    await expect(page.getByText("Bet", { exact: true })).toBeVisible();
    await page
      .getByRole("button", { name: /^Long inference pure-plays/ })
      .click();
    await expect(page.locator('input[type="date"]')).toHaveValue("2026-08-15");
  });

  test("renames a list item on double-click without navigating away", async ({
    page,
  }) => {
    await openFirstThesis(page);

    const row = listItem(page, "Long inference pure-plays");
    await row.dblclick();

    const input = page.locator("input").first();
    await expect(input).toBeFocused();
    await input.fill("Renamed inference bet");
    await input.press("Enter");

    await expect(listItem(page, "Renamed inference bet")).toBeVisible();
    // Still on thesis view (not drilled into the bet)
    await expect(page.getByText("Thesis", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Bets/ })).toBeVisible();
  });

  test("collapses and expands a children section", async ({ page }) => {
    await openFirstThesis(page);
    const bets = page.getByRole("button", { name: /^Bets/ });
    await expect(listItem(page, "Long inference pure-plays")).toBeVisible();

    await bets.click();
    await expect(listItem(page, "Long inference pure-plays")).toHaveCount(0);

    await bets.click();
    await expect(listItem(page, "Long inference pure-plays")).toBeVisible();
  });

  test("patching a deleted entity does not crash the app", async ({ page }) => {
    await openFirstThesis(page);
    await page.getByRole("button", { name: "+ Bet" }).click();
    const row = listItem(page, "New Bet");
    await expect(row).toBeVisible();

    const storeRes = await page.request.get("/api/store");
    const store = await storeRes.json();
    const created = Object.values(
      store.entities as Record<string, { id: string; title: string; type: string }>,
    ).find((e) => e.title === "New Bet" && e.type === "bet");
    expect(created).toBeTruthy();

    // Start inline rename, then delete the entity out from under the client
    await row.dblclick();
    const input = page.locator("input").first();
    await expect(input).toBeFocused();
    await input.fill("stale rename");

    const del = await page.request.delete("/api/store", {
      data: { id: created!.id },
    });
    expect(del.ok()).toBeTruthy();

    // Commit rename — old code threw and Next.js showed a blocking error overlay
    await input.press("Enter");
    await page.waitForTimeout(400);

    await expect(page.getByText("Entity not found")).toHaveCount(0);
    await expect(page.getByText("Unhandled Runtime Error")).toHaveCount(0);
    await expect(page.getByText("Thesis", { exact: true })).toBeVisible();
    await expect(listItem(page, "stale rename")).toHaveCount(0);
    // App still usable
    await expect(page.getByRole("button", { name: /^Bets/ })).toBeVisible();
  });

  test("deleting from the list removes the row", async ({ page }) => {
    page.on("dialog", (dialog) => dialog.accept());

    await openFirstThesis(page);
    await page.getByRole("button", { name: "+ Bet" }).click();
    await expect(listItem(page, "New Bet")).toBeVisible();

    await page.getByRole("button", { name: "Delete New Bet" }).click();
    await expect(listItem(page, "New Bet")).toHaveCount(0);
  });
});
