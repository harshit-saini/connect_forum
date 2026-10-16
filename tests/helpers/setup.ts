// Deterministic env for unit tests. Real secrets are never used.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://cf:cf@localhost:5432/connect_forum_test";
process.env.DIRECT_DATABASE_URL = process.env.DATABASE_URL;
process.env.APP_URL = "http://localhost:3000";
process.env.AUTH_SECRET = "test-secret-test-secret-test-secret-123456";
process.env.CRON_SECRET = "test-cron-secret-123456";
process.env.VAULT_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
process.env.MOCK_AI = "true";
process.env.ADMIN_EMAILS = "admin@example.com";
