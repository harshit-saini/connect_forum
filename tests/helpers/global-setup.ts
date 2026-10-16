import { execSync } from "node:child_process";

/** Applies migrations to the test database once per run. */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgres://cf:cf@localhost:5432/connect_forum_test";
  execSync("pnpm exec tsx scripts/migrate.ts", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url, DIRECT_DATABASE_URL: url },
  });
}
