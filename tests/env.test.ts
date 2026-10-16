import { describe, expect, it } from "vitest";
import { parseEnv } from "@/server/env";

const base = {
  DATABASE_URL: "postgres://u:p@localhost:5432/db",
  APP_URL: "http://localhost:3000",
  AUTH_SECRET: "x".repeat(40),
  CRON_SECRET: "y".repeat(20),
  VAULT_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
};

describe("parseEnv", () => {
  it("accepts a minimal mock-mode config and applies defaults", () => {
    const env = parseEnv({ ...base, MOCK_AI: "true", ADMIN_EMAILS: " A@x.com, b@x.com " } as never);
    expect(env.MOCK_AI).toBe(true);
    expect(env.ENABLE_EMBEDDINGS).toBe(true);
    expect(env.MATCH_COOLDOWN_MINUTES).toBe(60);
    expect(env.ADMIN_EMAILS).toEqual(["a@x.com", "b@x.com"]);
  });

  it("treats empty values from .env files as unset", () => {
    const env = parseEnv({ ...base, MOCK_AI: "true", FOUNDRY_ENDPOINT: "", RESEND_API_KEY: "", DIRECT_DATABASE_URL: "" } as never);
    expect(env.FOUNDRY_ENDPOINT).toBeUndefined();
  });

  it("requires AI and email keys when not in mock mode", () => {
    expect(() => parseEnv({ ...base, MOCK_AI: "false" } as never)).toThrow(/FOUNDRY_API_KEY/);
  });

  it("does not require embedding keys when embeddings are disabled", () => {
    const env = parseEnv({
      ...base,
      MOCK_AI: "false",
      ENABLE_EMBEDDINGS: "false",
      RESEND_API_KEY: "k",
      RESEND_WEBHOOK_SECRET: "s",
      FOUNDRY_ENDPOINT: "https://example.services.ai.azure.com",
      FOUNDRY_API_KEY: "k",
      LLM_DEPLOYMENT: "claude-sonnet",
    } as never);
    expect(env.ENABLE_EMBEDDINGS).toBe(false);
  });

  it("rejects a vault key that is not 32 bytes", () => {
    expect(() => parseEnv({ ...base, MOCK_AI: "true", VAULT_ENCRYPTION_KEY: "c2hvcnQ=" } as never)).toThrow(/32 bytes/);
  });
});
