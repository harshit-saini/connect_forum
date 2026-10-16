import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Pixel 7"], launchOptions: { executablePath: process.env.CHROMIUM_PATH || undefined } },
    },
  ],
  webServer: {
    // Production build: no dev-compile delays or pre-hydration races, and it is what ships.
    command: `pnpm exec next build && pnpm exec next start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    env: { APP_URL: `http://localhost:${PORT}`, MOCK_AI: "true", NEXT_DIST_DIR: ".next-e2e" },
  },
});
