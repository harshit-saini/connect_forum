import { expect, test } from "./fixtures";
import { E2E_IDS, freeMemberIds, openFinder, registerSeeker, signIn, sql } from "./helpers";

test.beforeAll(freeMemberIds);
test.afterAll(freeMemberIds);

// Needs seeded Guides (`pnpm seed`).
test("sign in, register, FAQs, find guides, connect, e-mailed details, show number, rate", async ({ page }) => {
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
  const guideName = (await first.getByRole("heading", { level: 3 }).textContent())!;

  // 4. Connect: no approval step, the card says "Details sent"
  await first.getByRole("button", { name: "I want to connect" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Email me their details" }).click();
  await expect(first.getByText("Details sent")).toBeVisible();

  // 5. The Guide's details and phone number arrive by e-mail, and the Guide gets a heads-up
  await expect(async () => {
    const rows = await sql<{ text: string }>("select text from dev_outbox where \"to\" = $1 and subject = 'Your Guide''s details' and created_at > $2 order by created_at desc limit 1", [email, startedAt]);
    expect(rows[0]?.text).toContain(guideName);
    expect(rows[0]?.text).toMatch(/\+9190000000\d\d/);
  }).toPass({ timeout: 20_000 });
  await expect(async () => {
    const rows = await sql("select 1 from dev_outbox where subject = 'A Seeker has been given your details' and created_at > $1", [startedAt]);
    expect(rows.length).toBeGreaterThan(0);
  }).toPass({ timeout: 20_000 });

  // 6. Show number (the fallback when the e-mail is lost)
  await page.goto("/seeker/connections");
  await expect(page.getByText(guideName).first()).toBeVisible();
  await expect(page.getByText("Connected", { exact: true })).toBeVisible();
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
