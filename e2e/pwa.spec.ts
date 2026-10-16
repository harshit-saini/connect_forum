import { expect, test } from "./fixtures";
import { signIn } from "./helpers";

test("manifest and icons are installable", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/manifest.webmanifest");
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest).toMatchObject({ display: "standalone", short_name: "Connect", start_url: "/dashboard", theme_color: "#0f766e" });
  const purposes = manifest.icons.map((i: { purpose: string; sizes: string }) => `${i.sizes}:${i.purpose}`);
  expect(purposes).toEqual(expect.arrayContaining(["192x192:any", "512x512:any", "512x512:maskable"]));
  for (const icon of manifest.icons) {
    const res = await request.get(icon.src);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("image/png");
  }
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
});

test("the service worker never caches API, auth or personal pages, and shows an offline page", async ({ page, context }) => {
  await signIn(page, "seed-seeker-1@example.com");
  await expect(page).toHaveURL(/\/seeker$/);

  // The worker registers and takes control.
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

  // Use the app: personal pages, API reads and writes, the reveal endpoint, and a sign-in page.
  await page.goto("/seeker/connections");
  await page.goto("/profile");
  await page.evaluate(async () => {
    await fetch("/api/matches/runs/00000000-0000-4000-8000-000000000000");
    await fetch("/api/connections/00000000-0000-4000-8000-000000000000/reveal", { method: "POST" });
    await fetch("/api/auth/get-session");
  });
  await page.goto("/sign-in");
  await page.goto("/seeker");

  // Inspect every cache: only static assets and the offline page may be there.
  const cached = await page.evaluate(async () => {
    const out: string[] = [];
    for (const name of await caches.keys()) for (const r of await (await caches.open(name)).keys()) out.push(new URL(r.url).pathname);
    return out;
  });
  expect(cached.length).toBeGreaterThan(0);
  expect(cached).toContain("/offline.html");
  for (const path of cached) expect(path, path).toMatch(/^\/(_next\/static\/|icons\/|offline\.html$)/);

  // Offline: any page falls back to the offline screen, and no personal data is shown.
  await context.setOffline(true);
  await page.goto("/seeker/connections").catch(() => undefined);
  await expect(page.getByRole("heading", { name: "You're offline" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("seed-seeker-1");
  await context.setOffline(false);
});

test("iOS Safari gets Add to Home Screen instructions, and dismissing hides them", async ({ browser }) => {
  const ctx = await browser.newContext({
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
    viewport: { width: 390, height: 844 },
  });
  const page = await ctx.newPage();
  await page.goto("/");
  const banner = page.getByRole("complementary", { name: "Install the app" });
  await expect(banner).toBeVisible();
  await expect(banner).toContainText("Add to Home Screen");
  await banner.getByRole("button", { name: "Dismiss install prompt" }).click();
  await expect(banner).toHaveCount(0);
  await page.reload();
  await expect(banner).toHaveCount(0); // stays dismissed
  await ctx.close();
});

test("Android/Chrome shows an Install button when the browser offers installation", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("complementary", { name: "Install the app" })).toHaveCount(0); // nothing offered yet
  await page.evaluate(() => {
    const e = new Event("beforeinstallprompt", { cancelable: true });
    Object.assign(e, { prompt: async () => undefined, userChoice: Promise.resolve({ outcome: "accepted" }) });
    window.dispatchEvent(e);
  });
  const banner = page.getByRole("complementary", { name: "Install the app" });
  await expect(banner).toBeVisible();
  await banner.getByRole("button", { name: "Install", exact: true }).click();
  await expect(banner).toHaveCount(0);
});
