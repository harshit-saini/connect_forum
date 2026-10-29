import pg from "pg";
import { expect, test } from "./fixtures";
import { signIn } from "./helpers";

const GUIDE = "seed-guide-1@example.com";
const url = process.env.DATABASE_URL ?? "postgres://cf:cf@localhost:5432/connect_forum";

async function resetGuide() {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  await c.query("update guide_profiles set matching_paused = false where user_id = (select id from users where email = $1)", [GUIDE]);
  await c.end();
}

test.beforeAll(resetGuide);
test.afterAll(resetGuide);

test("a guide sees an aggregate-only rating card and can pause matching", async ({ page }) => {
  await signIn(page, GUIDE);
  await expect(page).toHaveURL(/\/guide$/);
  await expect(page.getByRole("heading", { name: "Guide dashboard" })).toBeVisible();
  await expect(page.getByTestId("guide-rating")).toContainText(/Not shown yet|★/);

  const toggle = page.getByRole("switch", { name: "Pause matching" });
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  await expect(page.getByText("Matching is paused")).toBeVisible();
  await expect(toggle).toBeEnabled(); // the label flips optimistically; the switch is disabled until the save has finished
  await page.reload();
  await expect(page.getByRole("switch", { name: "Pause matching" })).toBeChecked();
  await page.getByRole("switch", { name: "Pause matching" }).uncheck();
  await expect(page.getByText("Matching is active")).toBeVisible();
});
