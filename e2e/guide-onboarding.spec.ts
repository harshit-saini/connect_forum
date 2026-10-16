import { type Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import pg from "pg";
import { signIn } from "./helpers";

async function addTag(page: Page, label: string, text: string) {
  const box = page.getByRole("textbox", { name: label, exact: true });
  await box.fill(text);
  await box.press("Enter");
}

test("a guide completes the wizard; the phone goes to the vault and is never echoed back", async ({ page }) => {
  const problems: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && /hydrat|did not match/i.test(m.text())) problems.push(m.text());
  });

  const email = `guide-${Date.now()}@example.com`;
  await signIn(page, email);
  await page.getByRole("button", { name: "Continue as Guide" }).click();

  // Basics
  await page.getByRole("button", { name: "Suggest" }).click();
  await addTag(page, "Languages", "English");
  await page.getByLabel(/Terms of use/).check();
  await page.getByLabel(/Privacy policy/).check();
  await page.getByLabel(/processed by AI/).check();
  await page.getByRole("button", { name: "Save and continue" }).click();

  // Background, including the required past role
  await expect(page.getByRole("heading", { name: "Professional background" })).toBeVisible();
  await page.getByLabel("Current status").selectOption("employed_full_time");
  await page.getByLabel("Current job title").fill("Engineering manager");
  await page.getByLabel("Current industry").selectOption("it_software");
  await page.getByLabel("Current job function").selectOption("software_engineering");
  await page.getByLabel("Total years of experience").fill("12");
  await page.getByLabel("Seniority level").selectOption("manager");
  for (const s of ["Leadership", "Coaching", "Python"]) await addTag(page, "Skills", s);
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page.getByText("Add at least one past role", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "+ Add a role" }).click();
  await page.getByLabel("Title", { exact: true }).fill("Backend developer");
  await page.getByLabel("Industry", { exact: true }).selectOption("it_software");
  await page.getByLabel("Function", { exact: true }).selectOption("software_engineering");
  await page.getByLabel("Start year").fill("2012");
  await page.getByLabel("Current role").check();
  await page.getByLabel("One-line summary").fill("Built and scaled payment APIs");
  await page.getByRole("button", { name: "Save and continue" }).click();

  // Expertise
  await expect(page.getByRole("heading", { name: "Expertise" })).toBeVisible();
  await addTag(page, "Primary functions", "Software engineering");
  await addTag(page, "Primary industries", "IT / software");
  const help = page.getByRole("group", { name: /^Can help with/ });
  await help.getByRole("checkbox", { name: "Interview preparation" }).check();
  await help.getByRole("checkbox", { name: "Resume / CV review" }).check();
  await page.getByLabel("Your level for Interview preparation").selectOption("expert");
  await page.getByRole("button", { name: "Move Resume / CV review up" }).click();
  await page.getByRole("checkbox", { name: /Mid-career/ }).check();
  await page.getByRole("radio", { name: "Regularly interviewed" }).check();
  await page.getByLabel("Experience summary").fill("I have led engineering teams for ten years, interviewed hundreds of candidates and mentored many people moving into management roles.");
  await page.getByRole("button", { name: "Save and continue" }).click();

  // Availability and contact: phone is required
  await expect(page.getByRole("heading", { name: "Availability and contact" })).toBeVisible();
  await page.getByLabel("Max new Seekers per month").fill("3");
  await page.getByRole("checkbox", { name: "Wed Evening" }).click();
  await page.getByRole("checkbox", { name: "Thu Evening" }).click();
  await page.getByLabel("Session length I'm comfortable with").selectOption("30");
  await page.getByRole("radio", { name: "Video call" }).check();
  await page.getByRole("radio", { name: "Call", exact: true }).check();
  await page.getByLabel("Best time to contact").fill("Weekday evenings");
  await page.getByLabel("My number is shown only to Seekers I approve.").check();
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page.getByText("Your phone number is required")).toBeVisible();
  await page.getByLabel("Phone number").fill("98765 43210");
  await page.getByRole("button", { name: "Save and continue" }).click();

  await expect(page.getByRole("heading", { name: "What others will see" })).toBeVisible();
  await expect(page.getByText("Saved securely (ends 3210)")).toBeVisible();
  await expect(page.getByText("9876543210")).toHaveCount(0);
  await page.getByRole("button", { name: "Submit profile" }).click();
  await expect(page).toHaveURL(/\/guide$/);

  // The vault holds ciphertext only.
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL ?? "postgres://cf:cf@localhost:5432/connect_forum" });
  await client.connect();
  const { rows } = await client.query("select encode(encrypted_number,'escape') as raw, last4 from phone_vault v join users u on u.id=v.guide_id where u.email=$1", [email]);
  await client.end();
  expect(rows).toHaveLength(1);
  expect(rows[0].last4).toBe("3210");
  expect(rows[0].raw).not.toContain("9876543210");

  // Editing the saved profile never shows the number back.
  await page.goto("/profile/edit/availability");
  await expect(page.getByText("ending in")).toBeVisible();
  await expect(page.getByText("9876543210")).toHaveCount(0);
  expect(problems).toEqual([]);
});
