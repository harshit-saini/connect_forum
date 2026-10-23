import { expect, test } from "./fixtures";
import { E2E_IDS, freeMemberIds, openFinder, registerSeeker, signIn, sql } from "./helpers";

test.beforeAll(freeMemberIds);
test.afterAll(freeMemberIds);

// Needs seeded Guides (`pnpm seed`).
test("sign in, register, FAQs, find guides, request, approve, reveal, rate", async ({ page, browser }) => {
  const email = `happy-${Date.now()}@example.com`;
  const startedAt = new Date();

  // 1. Sign in and register on the one-page form
  await signIn(page, email);
  await registerSeeker(page, E2E_IDS.seeker[1]!);
  await expect(page).toHaveURL(/\/seeker$/);

  // 2. The FAQs come first; this question still needs a Guide
  await openFinder(page);

  // 3. Find guides
  await page.getByRole("button", { name: "Find guides" }).click();
  const first = page.getByRole("listitem").filter({ hasText: "Why this Guide" }).first();
  await expect(first).toBeVisible({ timeout: 60_000 });
  const alias = (await first.getByRole("heading", { level: 3 }).textContent())!;

  // 4. Request
  await first.getByRole("button", { name: "I want to connect" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Send request" }).click();
  await expect(first.getByText("Request sent")).toBeVisible();

  // 5. The Guide (not signed in) approves from the emailed link
  let link = "";
  await expect(async () => {
    const rows = await sql<{ text: string }>("select text from dev_outbox where subject like 'A Seeker would like%' and created_at > $1 order by created_at desc limit 1", [startedAt]);
    link = /(http:\/\/\S+\/review\/[A-Za-z0-9_-]{43})/.exec(rows[0]?.text ?? "")?.[1] ?? "";
    expect(link).not.toBe("");
  }).toPass({ timeout: 20_000 });
  const guideCtx = await browser.newContext();
  const guide = await guideCtx.newPage();
  await guide.goto(link);
  await guide.getByRole("button", { name: /Approve/ }).click();
  await expect(guide.getByText(/Seeker has been notified/)).toBeVisible();
  await guideCtx.close();

  // 6. Reveal
  await page.goto("/seeker/connections");
  await expect(page.getByText(alias)).toBeVisible();
  await page.getByRole("link", { name: "Open" }).click();
  await page.getByRole("button", { name: "Show number" }).click();
  await expect(page.getByTestId("revealed-number")).toHaveText(/^\+9190000000\d\d$/);

  // 7. Rate
  await page.getByRole("link", { name: "Rate this Guide" }).click();
  await page.getByLabel(/4 stars/).check({ force: true });
  await page.getByLabel(/Review/).fill("Practical and encouraging.");
  await page.getByRole("button", { name: "Submit rating" }).click();
  await expect(page.getByText("Thank you. Your rating helps other Seekers.")).toBeVisible();

  // Cleanup so repeated runs don't fill the pool with test accounts' requests.
  await sql("delete from users where email = $1", [email]);
});
