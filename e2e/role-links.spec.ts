import { expect, test } from "./fixtures";
import { E2E_IDS, freeMemberIds, registerSeeker, signIn, sql } from "./helpers";

test.beforeAll(freeMemberIds);
test.afterAll(freeMemberIds);

const userId = async (email: string) => (await sql<{ id: string }>("select id from users where email = $1", [email]))[0]!.id;

test("'I need guidance' from a registered Guide shows the 'already registered' card, not the Guide form", async ({ page }) => {
  const email = `role-guide-${Date.now()}@example.com`;
  await signIn(page, email);
  const id = await userId(email);
  await sql("insert into user_roles (user_id, role) values ($1, 'guide')", [id]);
  await sql(
    "insert into guide_profiles (user_id, member_id, data, categories, total_years, profile_version, profile_completed_at) values ($1, $2, $3, $4, 12, 1, now())",
    [id, E2E_IDS.guide[0], JSON.stringify({ jobTitle: "Engineering manager", about: "I have mentored many people.", totalYears: 12, categories: ["uncertainty"] }), ["uncertainty"]],
  );

  await page.goto("/");
  await page.getByRole("link", { name: "I need guidance" }).click();
  await expect(page).toHaveURL(/\/join\/seeker$/);
  await expect(page.getByRole("heading", { name: "This email is already registered as a Guide" })).toBeVisible();
  const main = page.getByRole("main");
  await expect(main.getByRole("button", { name: "Sign out" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Go to my dashboard" })).toHaveAttribute("href", "/guide");
  // Neither form is shown.
  await expect(page.getByRole("heading", { name: "Register as a Guide" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Ask for guidance" })).toHaveCount(0);
  await expect(page.getByLabel("Member ID")).toHaveCount(0);

  await main.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("an account with only an incomplete legacy Guide role reaches 'Ask for guidance' and can register as a Seeker", async ({ page }) => {
  const email = `role-legacy-${Date.now()}@example.com`;
  await signIn(page, email);
  const id = await userId(email);
  await sql("insert into user_roles (user_id, role) values ($1, 'guide')", [id]);
  await sql("insert into guide_profiles (user_id, data, profile_version) values ($1, '{}', 0)", [id]);

  await page.goto("/");
  await page.getByRole("link", { name: "I need guidance" }).click();
  await expect(page).toHaveURL(/\/join\/seeker$/);
  await expect(page.getByRole("heading", { name: "Ask for guidance" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /already registered/ })).toHaveCount(0);

  // Registering replaces the stale role.
  await registerSeeker(page, E2E_IDS.seeker[2]!);
  await expect(page.getByRole("heading", { name: "Seeker dashboard" })).toBeVisible();
  expect(await sql("select role from user_roles where user_id = $1", [id])).toEqual([{ role: "seeker" }]);

  await sql("delete from users where id = $1", [id]);
});
