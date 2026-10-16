import pg from "pg";
import { expect, test } from "./fixtures";
import { signIn } from "./helpers";

const SEEKER = "seed-seeker-1@example.com";

test.beforeAll(async () => {
  // Needs seeded data (pnpm seed). Reset this seeker's runs so cooldown and caching don't interfere.
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL ?? "postgres://cf:cf@localhost:5432/connect_forum" });
  await client.connect();
  await client.query("delete from blocks where blocker_id = (select id from users where email = $1) or blocked_id = (select id from users where email = $1)", [SEEKER]);
  await client.query("delete from reports where reporter_id = (select id from users where email = $1)", [SEEKER]);
  await client.query("delete from connection_requests where seeker_id = (select id from users where email = $1)", [SEEKER]);
  await client.query("delete from match_runs where seeker_id = (select id from users where email = $1)", [SEEKER]);
  await client.end();
});

test("a seeker finds guides and sees ranked matches with reasons", async ({ page }) => {
  await signIn(page, SEEKER);
  await expect(page).toHaveURL(/\/seeker$/);
  await expect(page.getByRole("heading", { name: "Ready when you are" })).toBeVisible();

  await page.getByRole("button", { name: "Find guides" }).click();

  // With the mock AI the run can finish before the first poll, so don't require seeing the progress card.
  await expect(page.getByRole("progressbar", { name: "Search progress" })).toHaveCount(0, { timeout: 60_000 });
  const cards = page.getByRole("listitem").filter({ hasText: "Why this Guide" });
  await expect(cards).toHaveCount(5);
  await expect(cards.first()).toContainText("Director of Product");
  await expect(page.getByText("(refining…)")).toHaveCount(0);

  // Reloading shows the saved results; searching again with nothing new says so.
  await page.reload();
  await expect(cards).toHaveCount(5);
  await page.getByRole("button", { name: "Search again" }).click();
  await expect(page.getByText("No new Guides since your last search")).toBeVisible();
});
