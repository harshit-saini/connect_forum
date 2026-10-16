import type { Page } from "@playwright/test";
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

export async function signIn(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Email me a code" }).click();
  const code = await latestCode(email);
  await page.getByLabel("6-digit code").fill(code);
  await page.getByRole("button", { name: "Sign in" }).click();
}
