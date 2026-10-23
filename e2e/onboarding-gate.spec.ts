import { expect, test } from "./fixtures";
import { signIn } from "./helpers";

test("the join link needs a sign-in, and members without a profile are gated to the form", async ({ page }) => {
  const email = `gate-${Date.now()}@example.com`;

  // The shareable link: signed-out visitors sign in and come straight back to the form.
  await page.goto("/join/guide");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fjoin%2Fguide/);

  await signIn(page, email, "/join/guide");
  await expect(page).toHaveURL(/\/join\/guide/);
  await expect(page.getByRole("heading", { name: "Register as a Guide" })).toBeVisible();

  // Without a role, gated pages send the member to choose how to join. Nothing is registered yet.
  await page.goto("/guide");
  await expect(page).toHaveURL(/\/join$/);
  await expect(page.getByRole("link", { name: "Join as a Seeker" })).toBeVisible();
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("the public pages are reachable without signing in", async ({ page }) => {
  await page.goto("/join");
  await expect(page.getByRole("heading", { name: "How would you like to join?" })).toBeVisible();
  await page.goto("/faq");
  await expect(page.getByRole("heading", { name: "Frequently asked questions" })).toBeVisible();
  for (const label of ["Layoff / Unemployment", "Career Stagnation", "Upskilling / Training", "Uncertainty"]) {
    await expect(page.getByRole("heading", { name: label })).toBeVisible();
  }
});
