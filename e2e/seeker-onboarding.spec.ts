import { type Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { signIn } from "./helpers";

async function addTag(page: Page, label: string, text: string) {
  const box = page.getByRole("textbox", { name: label, exact: true });
  await box.fill(text);
  await box.press("Enter");
}

test("a seeker completes the wizard with autosave and resume, then lands on the dashboard", async ({ page }) => {
  const email = `seeker-${Date.now()}@example.com`;
  await signIn(page, email);
  await page.getByRole("button", { name: "Continue as Seeker" }).click();
  await expect(page).toHaveURL(/\/onboarding/);

  // Step 1: basics. Contact details in free text are rejected inline.
  await page.getByRole("button", { name: "Suggest" }).click();
  await expect(page.getByLabel("Alias")).not.toHaveValue("");
  await page.getByLabel("City").fill("Pune");
  await addTag(page, "Languages", "English");
  await page.getByLabel(/Terms of use/).check();
  await page.getByLabel(/Privacy policy/).check();
  await page.getByLabel(/processed by AI/).check();
  await page.getByRole("button", { name: "Save and continue" }).click();

  // Step 2: background
  await expect(page.getByRole("heading", { name: "Professional background" })).toBeVisible();
  await page.getByLabel("Current status").selectOption("student");
  await page.getByLabel("Current job title").fill("Student");
  await page.getByLabel("Current industry").selectOption("it_software");
  await page.getByLabel("Current job function").selectOption("software_engineering");
  await page.getByLabel("Total years of experience").fill("1");
  await page.getByLabel("Seniority level").selectOption("entry");
  for (const s of ["Python", "SQL", "Excel"]) await addTag(page, "Skills", s);
  await page.getByRole("button", { name: "Save and continue" }).click();

  // Step 3: goals. Try a bad challenge first.
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
  const challenge = "I am an engineer who wants to move into product management but I do not know how to show relevant experience.";
  await page.getByLabel("Biggest challenge right now").fill(challenge + " Email me at me@example.com");
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page.getByText("Please remove contact details. Contact details are only shared after approval.")).toBeVisible();
  await page.getByLabel("Biggest challenge right now").fill(challenge);

  // Autosave then reload: the draft must survive.
  await expect(page.getByText("Draft saved")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Biggest challenge right now")).toHaveValue(challenge);
  await page.getByRole("button", { name: "Save and continue" }).click();

  // Step 4: preferences
  await expect(page.getByRole("heading", { name: "Preferences" })).toBeVisible();
  await page.getByRole("radio", { name: /A few sessions/ }).check();
  await page.getByRole("radio", { name: "Video call" }).check();
  await page.getByRole("checkbox", { name: "Tue Evening" }).click();
  await page.getByRole("checkbox", { name: "Sat Morning" }).click();
  await page.getByRole("button", { name: "Save and continue" }).click();

  // Step 5: review and submit
  await expect(page.getByRole("heading", { name: "What others will see" })).toBeVisible();
  await expect(page.getByText("Product manager").first()).toBeVisible();
  await page.getByRole("button", { name: "Submit profile" }).click();
  await expect(page).toHaveURL(/\/seeker$/);
  await expect(page.getByRole("heading", { name: "Seeker dashboard" })).toBeVisible();

  // Completed profile is editable.
  await page.goto("/profile");
  await expect(page.getByRole("heading", { name: "My profile" })).toBeVisible();
});
