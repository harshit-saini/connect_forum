import { expect, test } from "./fixtures";
import { signIn, sql } from "./helpers";

const TARGET = "seed-guide-12@example.com";
const reset = () => sql("update users set suspended_at = null where email = $1", [TARGET]);
test.beforeAll(reset);
test.afterAll(reset);

test("a non-admin cannot reach the admin area", async ({ page }) => {
  await signIn(page, "seed-seeker-2@example.com");
  await page.goto("/admin/users");
  await expect(page).not.toHaveURL(/\/admin/);
  await expect(page.getByRole("heading", { name: "Users" })).toHaveCount(0);
});

test("an admin can find a user, suspend and unsuspend them, and see it in the audit log", async ({ page }) => {
  await signIn(page, "admin@example.com");
  // A brand-new admin has to pick a role once; an existing one is redirected away from this page.
  await page.goto("/choose-role");
  const picked = await page.getByRole("button", { name: "Continue as Seeker" }).click({ timeout: 4000 }).then(() => true, () => false);
  if (picked) await page.waitForURL(/onboarding/); // the role is saved by a server action: let it finish
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Admin" })).toBeVisible();

  await page.goto("/admin/users");
  await page.getByRole("searchbox", { name: "Search users" }).or(page.getByLabel("Search users")).fill("seed-guide-12");
  await page.getByRole("button", { name: "Search" }).click();
  const row = page.getByRole("row").filter({ hasText: TARGET });
  await expect(row).toBeVisible();
  await row.getByLabel(/Reason for suspending/).fill("e2e check");
  await row.getByRole("button", { name: "Suspend" }).click();
  await expect(row.getByText("Suspended")).toBeVisible();
  await expect.poll(async () => (await sql("select suspended_at from users where email = $1", [TARGET]))[0]!.suspended_at !== null).toBe(true);

  await page.goto("/admin/audit");
  await page.getByLabel("Filter by action").selectOption("user.suspended");
  await page.getByRole("button", { name: "Filter" }).click();
  await expect(page.getByRole("row").filter({ hasText: "e2e check" }).first()).toBeVisible();

  await page.goto("/admin/users?q=seed-guide-12");
  await page.getByRole("row").filter({ hasText: TARGET }).getByRole("button", { name: "Unsuspend" }).click();
  await expect(page.getByRole("row").filter({ hasText: TARGET }).getByText("Active")).toBeVisible();
});
