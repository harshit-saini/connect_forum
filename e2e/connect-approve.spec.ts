import pg from "pg";
import { expect, test } from "./fixtures";
import { signIn } from "./helpers";

const SEEKER = "seed-seeker-1@example.com";
const conn = () => new pg.Client({ connectionString: process.env.DATABASE_URL ?? "postgres://cf:cf@localhost:5432/connect_forum" });

async function sql<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const c = conn();
  await c.connect();
  try {
    return (await c.query(text, params)).rows as T[];
  } finally {
    await c.end();
  }
}

test.beforeAll(async () => {
  await sql("delete from blocks where blocker_id = (select id from users where email = $1) or blocked_id = (select id from users where email = $1)", [SEEKER]);
  await sql("delete from ratings where seeker_id = (select id from users where email = $1)", [SEEKER]);
  await sql("delete from reports where reporter_id = (select id from users where email = $1)", [SEEKER]);
  await sql("delete from connection_requests where seeker_id = (select id from users where email = $1)", [SEEKER]);
  await sql("delete from match_runs where seeker_id = (select id from users where email = $1)", [SEEKER]);
});

test("request, review link, approve, and the seeker sees it approved", async ({ page, browser }) => {
  const startedAt = new Date();
  await signIn(page, SEEKER);
  await page.getByRole("button", { name: "Find guides" }).click();
  const first = page.getByRole("listitem").filter({ hasText: "Why this Guide" }).first();
  await expect(first).toBeVisible({ timeout: 60_000 });
  const alias = (await first.getByRole("heading", { level: 3 }).textContent())!;

  // Contact details in the note are rejected inline.
  await first.getByRole("button", { name: "I want to connect" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/Add a short note/).fill("call me on 98765 43210");
  await expect(dialog.getByText("Please remove contact details. Contact details are only shared after approval.")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Send request" })).toBeDisabled();
  await dialog.getByLabel(/Add a short note/).fill("I would love your view on moving into product.");
  await dialog.getByRole("button", { name: "Send request" }).click();
  await expect(first.getByText("Request sent")).toBeVisible();

  // The Guide gets an e-mail with a review link and only anonymous details.
  let link = "";
  await expect(async () => {
    const rows = await sql<{ text: string }>("select text from dev_outbox where subject like 'A Seeker would like%' and created_at > $1 order by created_at desc limit 1", [startedAt]);
    link = /(http:\/\/\S+\/review\/[A-Za-z0-9_-]{43})/.exec(rows[0]?.text ?? "")?.[1] ?? "";
    expect(link).not.toBe("");
  }).toPass({ timeout: 20_000 });

  // The Guide is not logged in: a fresh browser context.
  const guideCtx = await browser.newContext();
  const guide = await guideCtx.newPage();
  await guide.goto(link);
  await expect(guide.getByRole("heading", { name: /would like your guidance/ })).toBeVisible();
  await expect(guide.getByText("I would love your view on moving into product.")).toBeVisible();
  await expect(guide.locator("body")).not.toContainText("example.com");
  // Merely opening the link did nothing.
  expect((await sql<{ status: string }>("select status from connection_requests where seeker_id = (select id from users where email = $1)", [SEEKER]))[0]!.status).toBe("pending");

  // A tampered CSRF value is refused...
  await guide.locator('input[name="csrf"]').evaluate((el) => ((el as HTMLInputElement).value = "forged"));
  await guide.getByRole("button", { name: /Approve/ }).click();
  await expect(guide.getByText(/page has expired/)).toBeVisible();
  expect((await sql<{ status: string }>("select status from connection_requests where seeker_id = (select id from users where email = $1)", [SEEKER]))[0]!.status).toBe("pending");

  // ...and a fresh page approves.
  await guide.reload();
  await guide.getByRole("button", { name: /Approve/ }).click();
  await expect(guide.getByText(/Seeker has been notified/)).toBeVisible();
  await guide.reload();
  await expect(guide.getByRole("heading", { name: "Already answered" })).toBeVisible();
  await guideCtx.close();

  // The Seeker sees it approved, and the approval e-mail has no number.
  await page.goto("/seeker/connections");
  await expect(page.getByText(alias)).toBeVisible();
  await expect(page.getByText("Approved", { exact: true })).toBeVisible();
  const mails = await sql<{ text: string }>("select text from dev_outbox where \"to\" = $1 and subject = 'Your request was approved' and created_at > $2", [SEEKER, startedAt]);
  expect(mails.length).toBeGreaterThan(0);
  expect(mails[0]!.text.replace(/https?:\/\/\S+/g, "")).not.toMatch(/\+?\d[\d\s-]{8,}\d/);

  // Reveal: the number is not in the page until "Show number" is pressed, and the response is never cacheable.
  await page.getByRole("link", { name: "Open" }).click();
  await expect(page.getByRole("heading", { name: alias, exact: true })).toBeVisible();
  expect(await page.content()).not.toMatch(/\+9190000000\d\d/);
  const reveal = page.waitForResponse((r) => r.url().includes("/reveal"));
  await page.getByRole("button", { name: "Show number" }).click();
  const res = await reveal;
  expect(res.headers()["cache-control"]).toMatch(/no-store/);
  await expect(page.getByTestId("revealed-number")).toHaveText(/^\+9190000000\d\d$/);
  await expect(page.getByText(/Best time: Weekday evenings/)).toBeVisible();
  await page.getByRole("button", { name: "Hide" }).click();
  await expect(page.getByTestId("revealed-number")).toHaveCount(0);

  // Rating: submit, then edit within the window. The Guide never sees this.
  await page.getByRole("link", { name: "Rate this Guide" }).click();
  await expect(page.getByRole("heading", { name: new RegExp(`How was ${alias}`) })).toBeVisible();
  await page.getByLabel(/5 stars/).check({ force: true });
  await page.getByLabel(/Review/).fill("Clear, practical advice on switching into product.");
  await page.getByRole("button", { name: "Submit rating" }).click();
  await expect(page.getByText("Thank you. Your rating helps other Seekers.")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Update rating" })).toBeVisible();
  await page.getByLabel(/4 stars/).check({ force: true });
  await page.getByRole("button", { name: "Update rating" }).click();
  await expect(page.getByText("Your rating was updated.")).toBeVisible();
  await page.getByRole("link", { name: "Back to the connection" }).click();

  // Blocking the Guide ends access to the number.
  await page.getByRole("button", { name: "Report or block" }).click();
  const dialog2 = page.getByRole("dialog");
  await dialog2.getByLabel("Block", { exact: false }).first().check();
  await dialog2.getByRole("button", { name: "Block", exact: true }).click();
  await expect(dialog2.getByRole("heading", { name: "Blocked" })).toBeVisible();
  await dialog2.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Show number" }).click();
  await expect(page.getByText("This Guide's number is no longer available.")).toBeVisible();
});
