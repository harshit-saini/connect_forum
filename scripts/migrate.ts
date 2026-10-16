import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

/** Safe to run on every deploy: applies only pending migrations, inside a Postgres advisory lock. */
async function main() {
  const url = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DIRECT_DATABASE_URL or DATABASE_URL is required");
  // A pg.Client cannot be reused after a failed connect, so each attempt gets a fresh one. Retrying covers
  // Neon waking from scale-to-zero.
  let client!: pg.Client;
  for (let attempt = 1; ; attempt++) {
    client = new pg.Client({ connectionString: url });
    try {
      await client.connect();
      break;
    } catch (err) {
      await client.end().catch(() => undefined);
      if (attempt >= 5) throw err;
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    }
  }
  try {
    await client.query("SELECT pg_advisory_lock(727274)");
    await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
    console.log("migrations applied");
  } finally {
    await client.query("SELECT pg_advisory_unlock(727274)").catch(() => undefined);
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
