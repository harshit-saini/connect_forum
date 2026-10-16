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
async function resetAuthRateLimits() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL ?? "postgres://cf:cf@localhost:5432/connect_forum" });
  await client.connect();
  await client.query("delete from auth_rate_limits");
  await client.query("delete from rate_limits");
  await client.end();
}

export async function signIn(page: Page, email: string) {
  await resetAuthRateLimits();
  await page.goto("/sign-in");
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
}
