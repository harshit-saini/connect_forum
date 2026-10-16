import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { signIn, sql } from "./helpers";

/** Serious and critical WCAG 2.x A/AA violations fail the test; the report names the rule and element. */
async function expectAccessible(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const bad = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  const report = bad.map((v) => `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join("\n  ")}`).join("\n");
  expect(bad, `${label}\n${report}`).toEqual([]);
}

test("public pages are accessible", async ({ page }) => {
  for (const path of ["/", "/sign-in", "/terms", "/privacy", "/offline.html"]) {
    await page.goto(path);
    await expectAccessible(page, path);
  }
});

test("signed-in Seeker screens are accessible", async ({ page }) => {
  await sql("delete from match_runs where seeker_id = (select id from users where email = 'seed-seeker-3@example.com')");
  await signIn(page, "seed-seeker-3@example.com");
  await page.goto("/seeker");
  await expectAccessible(page, "/seeker (before search)");
  await page.getByRole("button", { name: "Find guides" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Why this Guide" }).first()).toBeVisible({ timeout: 60_000 });
  await expectAccessible(page, "/seeker (results)");
  await page.getByRole("button", { name: "I want to connect" }).first().click();
  await expectAccessible(page, "connect dialog");
  await page.keyboard.press("Escape");
  for (const path of ["/seeker/connections", "/profile", "/profile/edit/goals", "/profile/edit/preferences", "/settings"]) {
    await page.goto(path);
    await expectAccessible(page, path);
  }
});

test("signed-in Guide and Admin screens are accessible", async ({ page }) => {
  await signIn(page, "seed-guide-2@example.com");
  for (const path of ["/guide", "/profile/edit/expertise", "/profile/edit/availability"]) {
    await page.goto(path);
    await expectAccessible(page, path);
  }
  await page.context().clearCookies();
  await signIn(page, "admin@example.com");
  for (const path of ["/admin", "/admin/users", "/admin/reports", "/admin/ratings", "/admin/audit"]) {
    await page.goto(path);
    await expectAccessible(page, path);
  }
});

test("the onboarding wizard steps are accessible", async ({ page }) => {
  const email = `a11y-${Date.now()}@example.com`;
  await signIn(page, email);
  await page.getByRole("button", { name: "Continue as Guide" }).click();
  await expect(page).toHaveURL(/onboarding/);
  await expectAccessible(page, "wizard: basics");
  await sql("delete from users where email = $1", [email]);
});
