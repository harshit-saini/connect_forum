import { expect, type Page } from "@playwright/test";
import pg from "pg";

/** Reads the latest mock sign-in code for an address from the dev outbox. */
export async function latestCode(email: string): Promise<string> {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL ?? "postgres://cf:cf@localhost:5432/connect_forum" });
  await client.connect();
  try {
    for (let i = 0; i < 60; i++) {
      const { rows } = await client.query("select text from dev_outbox where \"to\" = $1 order by created_at desc limit 1", [email.toLowerCase()]);
      const m = rows[0] && /\b(\d{6})\b/.exec(rows[0].text);
      if (m) return m[1];
      await new Promise((r) => setTimeout(r, 250));
    }
  } finally {
    await client.end();
  }
  throw new Error(`No sign-in email for ${email}`);
}

/** Test-only: rate limits would otherwise trip when the same test users and IP are used again and again. */
export const resetLimits = () => resetAuthRateLimits();
async function resetAuthRateLimits() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL ?? "postgres://cf:cf@localhost:5432/connect_forum" });
  await client.connect();
  await client.query("delete from auth_rate_limits");
  await client.query("delete from rate_limits");
  await client.end();
}

/** Signs in through the real form. Pass `next` to follow a link the way a visitor would (e.g. /join/guide). */
export async function signIn(page: Page, email: string, next?: string) {
  await resetAuthRateLimits();
  await page.goto(next ? `/sign-in?next=${encodeURIComponent(next)}` : "/sign-in");
  // The first load of a page under `next dev` can be interacted with before React hydrates, which turns
  // the click into a native form submit. Retry until the code step appears.
  await expect(async () => {
    await page.getByLabel("Email address").fill(email);
    await page.getByRole("button", { name: "Email me a code" }).click();
    await expect(page.getByLabel("6-digit code")).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 30_000 });
  const code = await latestCode(email);
  await page.getByLabel("6-digit code").fill(code);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/sign-in/); // the session is set once we have left the sign-in page
}

export async function sql<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL ?? "postgres://cf:cf@localhost:5432/connect_forum" });
  await c.connect();
  try {
    return (await c.query(text, params)).rows as T[];
  } finally {
    await c.end();
  }
}

/** Member IDs the e2e server accepts (see playwright.config.ts). Each test frees its ID before and after use. */
export const E2E_IDS = { seeker: ["E2E-SEEKER-1", "E2E-SEEKER-2", "E2E-SEEKER-3"], guide: ["E2E-GUIDE-1", "E2E-GUIDE-2"] };

/** Removes whoever registered with an e2e member ID, so repeated runs can use it again. */
export async function freeMemberIds() {
  for (const t of ["seeker_profiles", "guide_profiles"]) {
    await sql(`delete from users where id in (select user_id from ${t} where member_id like 'E2E-%')`);
  }
}

/** Reaches the matching UI: a Seeker without a search yet sees the FAQs first, so choose "I still need a Guide". */
export async function openFinder(page: Page) {
  const find = page.getByRole("button", { name: /Find guides|Search again/ });
  const escalate = page.getByRole("button", { name: "I still need a Guide" });
  await expect(find.or(escalate)).toBeVisible();
  // Retry: the click does nothing until the page has hydrated.
  await expect(async () => {
    if (await escalate.isVisible()) await escalate.click();
    await expect(find).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 20_000 });
}

/** Fills and submits the Seeker form on /join/seeker. */
export async function registerSeeker(page: Page, memberId: string, category = "Career Stagnation") {
  await page.goto("/join/seeker");
  await expect(page.getByRole("heading", { name: "Ask for guidance" })).toBeVisible();
  await page.getByLabel("Member ID").fill(memberId);
  await page.getByRole("radio", { name: new RegExp(category) }).check();
  await page.getByLabel("Your question").fill("I have been in the same role for five years and want to move into product management but do not know where to start.");
  await page.getByLabel("Years of work experience").fill("5");
  await page.getByLabel(/I agree to the/).check();
  await page.getByRole("button", { name: "Join", exact: true }).click();
}
