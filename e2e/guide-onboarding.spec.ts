import pg from "pg";
import { expect, test } from "./fixtures";
import { E2E_IDS, freeMemberIds, signIn } from "./helpers";

test.beforeAll(freeMemberIds);
test.afterAll(freeMemberIds);

test("a guide registers on one page; the phone goes to the vault and is never echoed back", async ({ page }) => {
  const problems: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && /hydrat|did not match/i.test(m.text())) problems.push(m.text());
  });

  const email = `guide-${Date.now()}@example.com`;
  await signIn(page, email);
  await page.goto("/join/guide");
  await expect(page.getByRole("heading", { name: "Register as a Guide" })).toBeVisible();

  await page.getByLabel("Member ID").fill(E2E_IDS.guide[0]!);
  await page.getByRole("button", { name: "Suggest" }).click();
  await page.getByRole("checkbox", { name: /Career Stagnation/ }).check();
  await page.getByRole("checkbox", { name: /Uncertainty/ }).check();
  await page.getByLabel("Your current or last role").fill("Engineering manager");
  await page.getByLabel("How can you help?").fill("I moved from engineer to manager and have mentored many people who felt stuck in their roles.");
  await page.getByLabel("Years of work experience").fill("12");
  await page.getByLabel(/I agree to the/).check();

  // The phone number is required.
  await page.getByRole("button", { name: "Join as a Guide" }).click();
  await expect(page.getByText("Your phone number is required")).toBeVisible();
  await page.getByLabel("Phone number").fill("98765 43210");
  await page.getByRole("button", { name: "Join as a Guide" }).click();
  await expect(page).toHaveURL(/\/guide$/);
  await expect(page.getByRole("heading", { name: "Guide dashboard" })).toBeVisible();

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
