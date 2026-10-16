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

async function addTag(page: Page, label: string, text: string) {
  const box = page.getByRole("textbox", { name: label, exact: true });
  await box.fill(text);
  await box.press("Enter");
}

/** Fills the whole Seeker wizard (an engineer who wants to move into product) and submits it. */
export async function completeSeekerWizard(page: Page) {
  await page.getByRole("button", { name: "Suggest" }).click();
  await expect(page.getByLabel("Alias")).not.toHaveValue("");
  await addTag(page, "Languages", "English");
  await page.getByLabel(/Terms of use/).check();
  await page.getByLabel(/Privacy policy/).check();
  await page.getByLabel(/processed by AI/).check();
  await page.getByRole("button", { name: "Save and continue" }).click();

  await expect(page.getByRole("heading", { name: "Professional background" })).toBeVisible();
  await page.getByLabel("Current status").selectOption("employed_full_time");
  await page.getByLabel("Current job title").fill("Software engineer");
  await page.getByLabel("Current industry").selectOption("it_software");
  await page.getByLabel("Current job function").selectOption("software_engineering");
  await page.getByLabel("Total years of experience").fill("3");
  await page.getByLabel("Seniority level").selectOption("mid");
  for (const s of ["Python", "SQL", "Communication"]) await addTag(page, "Skills", s);
  await page.getByRole("button", { name: "Save and continue" }).click();

  await expect(page.getByRole("heading", { name: "Goals and needs" })).toBeVisible();
  await page.getByRole("radio", { name: /Early career/ }).check();
  await page.getByRole("radio", { name: /Switch career/ }).check();
  await page.getByLabel("Target role(s) 1").fill("Product manager");
  await page.getByRole("checkbox", { name: "Fintech" }).check();
  await page.getByLabel("Target function").selectOption("product_management");
  await page.getByLabel("Timeline", { exact: true }).selectOption("6_months");
  await page.getByLabel("Job search status").selectOption("preparing");
  await page.getByRole("checkbox", { name: "Career switch planning" }).check();
  await page.getByRole("checkbox", { name: "Interview preparation" }).check();
  await page.getByLabel("Biggest challenge right now").fill("I am an engineer who wants to move into product management but I do not know how to show relevant experience or what to learn first.");
  await page.getByRole("button", { name: "Save and continue" }).click();

  await expect(page.getByRole("heading", { name: "Preferences" })).toBeVisible();
  await page.getByRole("radio", { name: /A few sessions/ }).check();
  await page.getByRole("radio", { name: "Video call" }).check();
  await page.getByRole("checkbox", { name: "Tue Evening" }).click();
  await page.getByRole("checkbox", { name: "Sat Morning" }).click();
  await page.getByRole("button", { name: "Save and continue" }).click();

  await expect(page.getByRole("heading", { name: "What others will see" })).toBeVisible();
  await page.getByRole("button", { name: "Submit profile" }).click();
  await expect(page).toHaveURL(/\/seeker$/);
}
