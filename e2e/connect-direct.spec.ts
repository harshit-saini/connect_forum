import pg from "pg";
import { expect, test } from "./fixtures";
import { openFinder, signIn } from "./helpers";

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

const SEEKER2 = "seed-seeker-2@example.com";

test.beforeAll(async () => {
  for (const email of [SEEKER2]) {
    await sql("delete from ratings where seeker_id = (select id from users where email = $1)", [email]);
    await sql("delete from blocks where blocker_id = (select id from users where email = $1)", [email]);
    await sql("delete from connection_requests where seeker_id = (select id from users where email = $1)", [email]);
    await sql("delete from match_runs where seeker_id = (select id from users where email = $1)", [email]);
  }
  await sql("delete from blocks where blocker_id = (select id from users where email = $1) or blocked_id = (select id from users where email = $1)", [SEEKER]);
  await sql("delete from ratings where seeker_id = (select id from users where email = $1)", [SEEKER]);
  await sql("delete from reports where reporter_id = (select id from users where email = $1)", [SEEKER]);
  await sql("delete from connection_requests where seeker_id = (select id from users where email = $1)", [SEEKER]);
  await sql("delete from match_runs where seeker_id = (select id from users where email = $1)", [SEEKER]);
});

test("connect: details are emailed straight away, the card says Details sent, and the connection lists as Connected", async ({ page }) => {
  const startedAt = new Date();
  await signIn(page, SEEKER);
  await openFinder(page);
  await page.getByRole("button", { name: "Find guides" }).click();
  const first = page.getByRole("listitem").filter({ hasText: "Why this Guide" }).first();
  await expect(first).toBeVisible({ timeout: 60_000 });
  const guideName = (await first.getByRole("heading", { level: 3 }).textContent())!;

  // Contact details in the note are rejected inline.
  await first.getByRole("button", { name: "I want to connect" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(/emailed|by email/).first()).toBeVisible();
  await dialog.getByLabel(/Add a short note/).fill("call me on 98765 43210");
  await expect(dialog.getByText("Please remove contact details. Contact details can't be shared in free text.")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Email me their details" })).toBeDisabled();
  await dialog.getByLabel(/Add a short note/).fill("I would love your view on moving into product.");
  await dialog.getByRole("button", { name: "Email me their details" }).click();
  await expect(first.getByText("Details sent")).toBeVisible();
  await expect(first.getByRole("button", { name: "I want to connect" })).toHaveCount(0);

  // Approved straight away: one connection, no review token, an unlock for the pair.
  const conns = await sql<{ id: string; status: string; token_hash: string | null; guide_id: string }>("select id, status, token_hash, guide_id from connection_requests where seeker_id = (select id from users where email = $1)", [SEEKER]);
  expect(conns).toHaveLength(1);
  expect(conns[0]).toMatchObject({ status: "approved", token_hash: null });
  expect(await sql("select 1 from unlocks where connection_request_id = $1", [conns[0]!.id])).toHaveLength(1);

  // The Seeker is e-mailed the Guide's details and phone number.
  let seekerMail = "";
  await expect(async () => {
    const rows = await sql<{ text: string }>("select text from dev_outbox where \"to\" = $1 and subject = 'Your Guide''s details' and created_at > $2 order by created_at desc limit 1", [SEEKER, startedAt]);
    seekerMail = rows[0]?.text ?? "";
    expect(seekerMail).not.toBe("");
  }).toPass({ timeout: 20_000 });
  expect(seekerMail).toContain(guideName);
  expect(seekerMail).toMatch(/\+9190000000\d\d/);
  expect(seekerMail).not.toContain("/review/");
  expect(seekerMail).not.toContain("seed-guide-");

  // The Guide gets a short heads-up: the Seeker's category, question and note, and nothing to click or contact.
  let guideMail = "";
  await expect(async () => {
    const rows = await sql<{ text: string }>("select text from dev_outbox where subject = 'A Seeker has been given your details' and created_at > $1 and \"to\" = (select email from users where id = $2) order by created_at desc limit 1", [startedAt, conns[0]!.guide_id]);
    guideMail = rows[0]?.text ?? "";
    expect(guideMail).not.toBe("");
  }).toPass({ timeout: 20_000 });
  expect(guideMail).toContain("I would love your view on moving into product.");
  expect(guideMail).toMatch(/Category: /);
  expect(guideMail).not.toContain("/review/");
  expect(guideMail).not.toContain(SEEKER);

  // The old approval e-mails are gone: nobody was asked to review anything.
  expect(await sql("select 1 from dev_outbox where subject like 'A Seeker would like%' and created_at > $1", [startedAt])).toHaveLength(0);

  // The connection is listed as Connected.
  await page.goto("/seeker/connections");
  await expect(page.getByText(guideName).first()).toBeVisible();
  await expect(page.getByText("Connected", { exact: true })).toBeVisible();
  await expect(page.getByText("Approved", { exact: true })).toHaveCount(0);

  // Show number (the fallback when the e-mail is lost): the number is not in the page until it is pressed, and the response is never cacheable.
  await page.getByRole("link", { name: "Open" }).click();
  await expect(page.getByRole("heading", { name: guideName, exact: true })).toBeVisible();
  expect(await page.content()).not.toMatch(/\+9190000000\d\d/);
  const reveal = page.waitForResponse((r) => r.url().includes("/reveal"));
  await page.getByRole("button", { name: "Show number" }).click();
  const res = await reveal;
  expect(res.headers()["cache-control"]).toMatch(/no-store/);
  await expect(page.getByTestId("revealed-number")).toHaveText(/^\+9190000000\d\d$/);
  await page.getByRole("button", { name: "Hide" }).click();
  await expect(page.getByTestId("revealed-number")).toHaveCount(0);

  // Rating: submit, then edit within the window. The Guide never sees this.
  await page.getByRole("link", { name: "Rate this Guide" }).click();
  await expect(page.getByRole("heading", { name: new RegExp(`How was ${guideName}`) })).toBeVisible();
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

test("a Guide without a phone number: the e-mail says so plainly and the connection page has no Show number", async ({ page }) => {
  const startedAt = new Date();
  await signIn(page, SEEKER2);
  await openFinder(page);
  await page.getByRole("button", { name: "Find guides" }).click();
  const first = page.getByRole("listitem").filter({ hasText: "Why this Guide" }).first();
  await expect(first).toBeVisible({ timeout: 60_000 });
  const guideName = (await first.getByRole("heading", { level: 3 }).textContent())!;

  // No Guide has a number for the duration of this test (restored below), so whoever matches gives none.
  const saved = await sql<Record<string, unknown>>("select * from phone_vault");
  expect(saved.length).toBeGreaterThan(0);
  await sql("delete from phone_vault");
  try {
    await first.getByRole("button", { name: "I want to connect" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Email me their details" }).click();
    await expect(first.getByText("Details sent")).toBeVisible();

    let mail = "";
    await expect(async () => {
      const rows = await sql<{ text: string }>("select text from dev_outbox where \"to\" = $1 and subject = 'Your Guide''s details' and created_at > $2 order by created_at desc limit 1", [SEEKER2, startedAt]);
      mail = rows[0]?.text ?? "";
      expect(mail).not.toBe("");
    }).toPass({ timeout: 20_000 });
    expect(mail).toContain(guideName);
    expect(mail).toMatch(/can't contact them directly/);
    expect(mail).not.toMatch(/\+9190000000\d\d/);

    await page.goto("/seeker/connections");
    await page.getByRole("link", { name: "Open" }).click();
    await expect(page.getByRole("heading", { name: guideName, exact: true })).toBeVisible();
    await expect(page.getByText(/didn't give a phone number/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Show number" })).toHaveCount(0);
  } finally {
    for (const row of saved) {
      const cols = Object.keys(row);
      await sql(`insert into phone_vault (${cols.map((c) => `"${c}"`).join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")}) on conflict do nothing`, cols.map((c) => row[c]));
    }
    await sql("delete from connection_requests where seeker_id = (select id from users where email = $1)", [SEEKER2]);
  }
});
