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

test("an admin can send Guide invitations and sees the FAQ self-service numbers", async ({ page }) => {
  await signIn(page, "admin@example.com");
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "FAQ self-service" })).toBeVisible();
  await page.getByRole("link", { name: "Invite Guides by email" }).click();
  const to = `invitee-${Date.now()}@example.com`;
  await page.getByLabel("Email addresses").fill(`${to}, not-an-email`);
  await page.getByRole("button", { name: "Send invitations" }).click();
  await expect(page.getByText(/Sent 1 invitation\./)).toBeVisible();
  await expect(page.getByText(/Skipped invalid: not-an-email/)).toBeVisible();
  const rows = await sql<{ text: string }>("select text from dev_outbox where \"to\" = $1", [to]);
  expect(rows[0]!.text).toContain("/join/guide");
});
