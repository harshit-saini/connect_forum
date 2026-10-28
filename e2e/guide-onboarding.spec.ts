import pg from "pg";
import { expect, test } from "./fixtures";
import { E2E_IDS, freeMemberIds, signIn } from "./helpers";

test.beforeEach(freeMemberIds);
test.afterAll(freeMemberIds);

const DB = () => new pg.Client({ connectionString: process.env.DATABASE_URL ?? "postgres://cf:cf@localhost:5432/connect_forum" });
async function vaultRows(email: string) {
  const client = DB();
  await client.connect();
  try {
    return (await client.query("select last4 from phone_vault v join users u on u.id=v.guide_id where u.email=$1", [email])).rows as { last4: string }[];
  } finally {
    await client.end();
  }
}

/** Fills everything on /join/guide except the phone number. */
async function fillGuideForm(page: import("@playwright/test").Page) {
  await page.goto("/join/guide");
  await expect(page.getByRole("heading", { name: "Register as a Guide" })).toBeVisible();
  await page.getByLabel("Member ID").fill(E2E_IDS.guide[0]!);
  await page.getByRole("checkbox", { name: /Career Stagnation/ }).check();
  await page.getByRole("checkbox", { name: /Uncertainty/ }).check();
  await page.getByLabel("Your current or last role").fill("Engineering manager");
  await page.getByLabel("How can you help?").fill("I moved from engineer to manager and have mentored many people who felt stuck in their roles.");
  await page.getByLabel("Years of work experience").fill("12");
  await page.getByLabel(/I agree to the/).check();
}

test("a guide registers on one page; the phone goes to the vault and is never echoed back", async ({ page }) => {
  const problems: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && /hydrat|did not match/i.test(m.text())) problems.push(m.text());
  });

  const email = `guide-${Date.now()}@example.com`;
  await signIn(page, email);
  await fillGuideForm(page);
  await expect(page.getByLabel("Alias")).toHaveCount(0);

  // The number is optional, and the form says what happens to one you give.
  await expect(page.getByText("Phone number (optional)")).toBeVisible();
  await expect(page.getByText(/emailed to Seekers who connect with you/).first()).toBeVisible();
  await expect(page.getByText(/Leave it empty to share only your profile details/)).toBeVisible();

  // A half-typed number is not silently dropped.
  await page.getByLabel("Phone number").fill("987");
  await page.getByLabel("Phone number").blur(); // the field's own hint appears here and moves the button, so settle before clicking
  await expect(page.getByText(/doesn't look like a complete/)).toBeVisible();
  await page.getByRole("button", { name: "Join as a Guide" }).click();
  await expect(page.getByText(/looks incomplete/)).toBeVisible();
  await page.getByLabel("Phone number").fill("98765 43210");
  await page.getByRole("button", { name: "Join as a Guide" }).click();
  await expect(page).toHaveURL(/\/guide$/);
  await expect(page.getByRole("heading", { name: "Guide dashboard" })).toBeVisible();
  await expect(page.getByText(/ending 3210\) is emailed to every Seeker who connects/)).toBeVisible();

  // The vault holds ciphertext only.
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL ?? "postgres://cf:cf@localhost:5432/connect_forum" });
  await client.connect();
  const { rows } = await client.query("select encode(encrypted_number,'escape') as raw, last4 from phone_vault v join users u on u.id=v.guide_id where u.email=$1", [email]);
  expect(rows).toHaveLength(1);
  expect(rows[0].last4).toBe("3210");
  expect(rows[0].raw).not.toContain("9876543210");
  const p = await client.query("select categories, member_id from guide_profiles g join users u on u.id=g.user_id where u.email=$1", [email]);
  await client.end();
  expect(p.rows[0]).toEqual({ categories: ["career_stagnation", "uncertainty"], member_id: "E2E-GUIDE-1" });

  // Editing the saved profile never shows the number back, and the ID can't be changed.
  await page.goto("/profile/edit");
  await expect(page.getByText("ending in")).toBeVisible();
  await expect(page.getByText("9876543210")).toHaveCount(0);
  await expect(page.getByLabel("Member ID")).toHaveAttribute("readonly", "");
  expect(problems).toEqual([]);
});

test("a guide registers without a phone number: nothing is stored and the dashboard says Seekers get only the profile", async ({ page }) => {
  const email = `guide-nophone-${Date.now()}@example.com`;
  await signIn(page, email);
  await fillGuideForm(page);
  await page.getByRole("button", { name: "Join as a Guide" }).click();
  await expect(page).toHaveURL(/\/guide$/);
  await expect(page.getByText(/haven't added a phone number/)).toBeVisible();
  expect(await vaultRows(email)).toHaveLength(0);

  await page.goto("/profile/edit");
  await expect(page.getByLabel("Phone number")).toBeVisible();
  await expect(page.getByText("ending in")).toHaveCount(0);
});

test("a guide adds a number later and then removes it: removing deletes the vault row", async ({ page }) => {
  const email = `guide-remove-${Date.now()}@example.com`;
  await signIn(page, email);
  await fillGuideForm(page);
  await page.getByRole("button", { name: "Join as a Guide" }).click();
  await expect(page).toHaveURL(/\/guide$/);
  expect(await vaultRows(email)).toHaveLength(0);

  // Add
  await page.goto("/profile/edit");
  await page.getByLabel("Phone number").fill("98765 43210");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page).toHaveURL(/\/guide$/);
  expect(await vaultRows(email)).toEqual([{ last4: "3210" }]);

  // Remove, change your mind, remove again
  await page.goto("/profile/edit");
  await expect(page.getByText("ending in")).toBeVisible();
  await page.getByRole("button", { name: "Remove number" }).click();
  await expect(page.getByText(/will be removed when you save/)).toBeVisible();
  await page.getByRole("button", { name: "Keep my number" }).click();
  await expect(page.getByText("ending in")).toBeVisible();
  await page.getByRole("button", { name: "Remove number" }).click();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page).toHaveURL(/\/guide$/);
  await expect(page.getByText(/haven't added a phone number/)).toBeVisible();
  expect(await vaultRows(email)).toHaveLength(0);
});
