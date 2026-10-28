import { expect, test } from "./fixtures";
import { E2E_IDS, freeMemberIds, signIn, sql } from "./helpers";

test.beforeAll(freeMemberIds);
test.afterAll(freeMemberIds);

test("a seeker registers on one page: the member ID is checked, contact details are refused, then the FAQs come first", async ({ page }) => {
  const email = `seeker-${Date.now()}@example.com`;
  await signIn(page, email);
  await page.goto("/join/seeker");
  await expect(page.getByRole("heading", { name: "Ask for guidance" })).toBeVisible();

  const question = "I have been in the same role for five years and want to move into product management but do not know where to start.";
  await expect(page.getByLabel("Alias")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Suggest" })).toHaveCount(0);
  await page.getByRole("radio", { name: /Career Stagnation/ }).check();
  await page.getByLabel("Years of work experience").fill("5");
  await page.getByLabel(/I agree to the/).check();

  // Hard member-ID check: an unknown ID is refused on the server.
  await page.getByLabel("Member ID").fill("NOT-A-MEMBER");
  await page.getByLabel("Your question").fill(question);
  await page.getByRole("button", { name: "Join", exact: true }).click();
  await expect(page.getByText("We couldn't find that member ID. Check it and try again.")).toBeVisible();
  await expect(page).toHaveURL(/\/join\/seeker/);

  // A Guide's ID is not valid for a Seeker.
  await page.getByLabel("Member ID").fill(E2E_IDS.guide[0]!);
  await page.getByRole("button", { name: "Join", exact: true }).click();
  await expect(page.getByText("We couldn't find that member ID. Check it and try again.")).toBeVisible();

  // Contact details in the question are rejected inline.
  await page.getByLabel("Member ID").fill(E2E_IDS.seeker[0]!.toLowerCase());
  await page.getByLabel("Your question").fill(question + " Email me at me@example.com");
  await page.getByRole("button", { name: "Join", exact: true }).click();
  await expect(page.getByText("Please remove contact details. Contact details are only shared after approval.")).toBeVisible();

  await page.getByLabel("Your question").fill(question);
  await page.getByRole("button", { name: "Join", exact: true }).click();
  await expect(page).toHaveURL(/\/seeker$/);
  await expect(page.getByRole("heading", { name: "Seeker dashboard" })).toBeVisible();

  // FAQs come first: answered questions never reach a Guide.
  await expect(page.getByRole("heading", { name: "Quick answers first" })).toBeVisible();
  await expect(page.getByText("How do I know if I am really stuck")).toBeVisible();
  await expect(page.getByRole("button", { name: "Find guides" })).toHaveCount(0);
  await page.getByRole("button", { name: "This answered my question" }).click();
  await expect(page.getByRole("heading", { name: "Glad that helped" })).toBeVisible();
  await expect.poll(async () => (await sql("select outcome from faq_events f join users u on u.id = f.user_id where u.email = $1", [email])).map((r) => (r as { outcome: string }).outcome)).toEqual(["resolved"]);

  // The member ID is saved normalised, and the profile page shows it only to the member; it can't be changed.
  const rows = await sql<{ member_id: string; category: string }>("select member_id, category from seeker_profiles p join users u on u.id = p.user_id where u.email = $1", [email]);
  expect(rows[0]).toEqual({ member_id: "E2E-SEEKER-1", category: "career_stagnation" });
  await page.goto("/profile/edit");
  await expect(page.getByLabel("Member ID")).toHaveValue("E2E-SEEKER-1");
  await expect(page.getByLabel("Member ID")).toHaveAttribute("readonly", "");
  // The form is also bound to the same member from /join: a registered Seeker is sent to the dashboard.
  await page.goto("/join/seeker");
  await expect(page).toHaveURL(/\/seeker$/);
});
