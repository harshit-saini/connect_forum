import { randomUUID } from "node:crypto";

// Deterministic env for unit tests. Real secrets are never used.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://cf:cf@localhost:5432/connect_forum_test";
process.env.DIRECT_DATABASE_URL = process.env.DATABASE_URL;
process.env.APP_URL = "http://localhost:3000";
process.env.AUTH_SECRET = "test-secret-test-secret-test-secret-123456";
process.env.CRON_SECRET = "test-cron-secret-123456";
process.env.VAULT_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
process.env.MOCK_AI = "true";
process.env.ADMIN_EMAILS = "admin@example.com";
process.env.RESEND_WEBHOOK_SECRET = "whsec_" + Buffer.from("test-webhook-secret-0123456789ab").toString("base64");

// Member IDs are checked against env allow-lists. The database outlives a run, so every test file gets its
// own random prefix; fixtures hand the IDs out in order (see tests/fixtures.ts).
const run = randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase();
process.env.TEST_MEMBER_PREFIX = run;
const ids = (letter: string) => Array.from({ length: 400 }, (_, i) => `${letter}${run}${i}`).join(",");
process.env.GUIDE_MEMBER_IDS = ids("G");
process.env.SEEKER_MEMBER_IDS = ids("S");
