import { expect, test } from "./fixtures";
import { resetLimits, signIn, sql } from "./helpers";

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

for (const role of ["seeker", "guide"] as const) {
  test(`the emailed sign-in link returns a new ${role} to their own join page`, async ({ page }) => {
    const email = `link-${role}-${Date.now()}@example.com`;
    await resetLimits();
    await page.goto(`/join/${role}`);
    await expect(page).toHaveURL(new RegExp(`/sign-in\\?next=%2Fjoin%2F${role}`));
    await expect(async () => {
      await page.getByLabel("Email address").fill(email);
      await page.getByRole("button", { name: "Email me a code" }).click();
      await expect(page.getByLabel("6-digit code")).toBeVisible({ timeout: 3000 });
    }).toPass({ timeout: 30_000 });

    // Open the link from the email in a fresh tab with no memory of where the visitor was going.
    let link = "";
    await expect(async () => {
      const rows = await sql<{ text: string }>('select text from dev_outbox where "to" = $1 order by created_at desc limit 1', [email]);
      link = /(http:\/\/\S+\/sign-in#\S+)/.exec(rows[0]?.text ?? "")?.[1] ?? "";
      expect(link).not.toBe("");
    }).toPass({ timeout: 20_000 });
    expect(link).toContain(`next=%2Fjoin%2F${role}`);

    const fresh = await page.context().newPage();
    await fresh.goto(link);
    await expect(fresh.getByLabel("6-digit code")).toHaveValue(/\d{6}/);
    await fresh.getByRole("button", { name: "Sign in" }).click();
    await expect(fresh).toHaveURL(new RegExp(`/join/${role}$`));
    await expect(fresh.getByRole("heading", { name: role === "seeker" ? "Ask for guidance" : "Register as a Guide" })).toBeVisible();
  });
}

test("a member can sign out from the join page and from the public pages, and is really signed out", async ({ page }) => {
  const email = `signout-${Date.now()}@example.com`;
  await signIn(page, email, "/join/seeker");
  await expect(page.getByRole("heading", { name: "Ask for guidance" })).toBeVisible();

  // The join page has no app navigation, so it must offer sign-out itself.
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
  await page.goto("/join/seeker");
  await expect(page).toHaveURL(/\/sign-in/); // the session is gone, not just hidden

  // Signed in again, the public landing page shows Sign out as well as Dashboard.
  await signIn(page, email, "/join/seeker");
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Dashboard" })).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/sign-in/);
});
