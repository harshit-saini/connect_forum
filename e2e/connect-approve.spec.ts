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
});
