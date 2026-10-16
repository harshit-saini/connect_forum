import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test("sign in, choose a role, and get gated into onboarding", async ({ page }) => {
  const email = `gate-${Date.now()}@example.com`;

  await page.goto("/seeker");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fseeker/);

  await signIn(page, email);
  await expect(page).toHaveURL(/\/choose-role/);
  await page.getByRole("button", { name: "Continue as Guide" }).click();
  await expect(page).toHaveURL(/\/onboarding/);

  // Gated pages bounce back to onboarding until the profile is complete.
  await page.goto("/guide");
  await expect(page).toHaveURL(/\/onboarding/);
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/$/);
});
