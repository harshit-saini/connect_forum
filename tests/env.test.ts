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
      GUIDE_MEMBER_IDS: "G-1",
      SEEKER_MEMBER_IDS: "S-1",
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

describe("LLM_PROVIDER", () => {
  const live = { ...base, MOCK_AI: "false", ENABLE_EMBEDDINGS: "false", RESEND_API_KEY: "k", RESEND_WEBHOOK_SECRET: "s", GUIDE_MEMBER_IDS: "G-1", SEEKER_MEMBER_IDS: "S-1", FOUNDRY_ENDPOINT: "https://x.openai.azure.com", FOUNDRY_API_KEY: "k", LLM_DEPLOYMENT: "gpt" };
  it("defaults to anthropic and accepts openai; anything else is rejected", () => {
    expect(parseEnv(live as never).LLM_PROVIDER).toBe("anthropic");
    expect(parseEnv({ ...live, LLM_PROVIDER: "openai" } as never).LLM_PROVIDER).toBe("openai");
    expect(() => parseEnv({ ...live, LLM_PROVIDER: "gemini" } as never)).toThrow(/LLM_PROVIDER/);
  });
});

describe("member ID allow-lists", () => {
  it("parses, normalises and de-duplicates comma, semicolon and newline separated lists", () => {
    const env = parseEnv({ ...base, MOCK_AI: "true", GUIDE_MEMBER_IDS: "g-1, G-2;g-1\n  g 33 ", SEEKER_MEMBER_IDS: "s-11" } as never);
    expect(env.GUIDE_MEMBER_IDS).toEqual(["G-1", "G-2", "G33"]);
    expect(env.SEEKER_MEMBER_IDS).toEqual(["S-11"]);
  });
  it("defaults to empty (nobody can register) in mock mode", () => {
    const env = parseEnv({ ...base, MOCK_AI: "true" } as never);
    expect(env.GUIDE_MEMBER_IDS).toEqual([]);
  });
  it("is required when not in mock mode, so the check can never be left open by accident", () => {
    const live = { ...base, MOCK_AI: "false", FOUNDRY_ENDPOINT: "https://x.example.com", FOUNDRY_API_KEY: "k", LLM_DEPLOYMENT: "m", EMBEDDING_DEPLOYMENT: "e", RESEND_API_KEY: "r", RESEND_WEBHOOK_SECRET: "whsec_x", FROM_EMAIL: "a@b.com" };
    expect(() => parseEnv(live as never)).toThrow(/GUIDE_MEMBER_IDS/);
    expect(() => parseEnv({ ...live, GUIDE_MEMBER_IDS: "G-1", SEEKER_MEMBER_IDS: "S-1" } as never)).not.toThrow(/MEMBER_IDS/);
  });
  it("rejects an entry that cannot be a member ID", () => {
    expect(() => parseEnv({ ...base, MOCK_AI: "true", GUIDE_MEMBER_IDS: "ok-1,bad id!" } as never)).toThrow(/member ID/);
  });
});

describe("AI_ENABLED and AI_BRANDING", () => {
  const live = { ...base, MOCK_AI: "false", RESEND_API_KEY: "k", RESEND_WEBHOOK_SECRET: "s", GUIDE_MEMBER_IDS: "G-1", SEEKER_MEMBER_IDS: "S-1" };

  it("defaults to AI on, and requires the model settings when it is on and live", () => {
    expect(parseEnv({ ...base, MOCK_AI: "true" } as never)).toMatchObject({ AI_ENABLED: true, AI_BRANDING: true, ENABLE_EMBEDDINGS: true });
    expect(() => parseEnv(live as never)).toThrow(/FOUNDRY_ENDPOINT/);
  });

  it("needs no model settings with AI off, and turns embeddings off with it", () => {
    const env = parseEnv({ ...live, AI_ENABLED: "false", ENABLE_EMBEDDINGS: "true" } as never);
    expect(env.AI_ENABLED).toBe(false);
    expect(env.ENABLE_EMBEDDINGS).toBe(false);
  });

  it("AI_BRANDING follows AI_ENABLED unless set explicitly", () => {
    expect(parseEnv({ ...live, AI_ENABLED: "false" } as never).AI_BRANDING).toBe(false);
    expect(parseEnv({ ...live, AI_ENABLED: "false", AI_BRANDING: "true" } as never)).toMatchObject({ AI_ENABLED: false, AI_BRANDING: true });
    expect(parseEnv({ ...base, MOCK_AI: "true", AI_BRANDING: "false" } as never)).toMatchObject({ AI_ENABLED: true, AI_BRANDING: false });
  });
});
