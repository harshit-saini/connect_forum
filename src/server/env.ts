import "server-only";
import { z } from "zod";

const bool = (def: boolean) =>
  z
    .enum(["true", "false", "1", "0"])
    .optional()
    .transform((v) => (v === undefined ? def : v === "true" || v === "1"));

const int = (def: number, min = 0) => z.coerce.number().int().min(min).default(def);

const base64Key32 = z
  .string()
  .refine((v) => Buffer.from(v, "base64").length === 32, "must be 32 bytes, base64-encoded (openssl rand -base64 32)");

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.string().url(),
    DIRECT_DATABASE_URL: z.string().url().optional(),
    APP_URL: z.string().url(),
    AUTH_SECRET: z.string().min(32, "use at least 32 random characters"),
    RESEND_API_KEY: z.string().optional(),
    RESEND_WEBHOOK_SECRET: z.string().optional(),
    FROM_EMAIL: z.string().min(3).default("Connect <no-reply@localhost>"),
    VAULT_ENCRYPTION_KEY: base64Key32,
    CRON_SECRET: z.string().min(16),
    ADMIN_EMAILS: z
      .string()
      .default("")
      .transform((v) =>
        v
          .split(",")
          .map((e) => e.trim().toLowerCase())
          .filter(Boolean),
      ),
    FOUNDRY_ENDPOINT: z.string().url().optional(),
    FOUNDRY_API_KEY: z.string().optional(),
    LLM_DEPLOYMENT: z.string().optional(),
    EMBEDDING_ENDPOINT: z.string().url().optional(),
    EMBEDDING_API_KEY: z.string().optional(),
    EMBEDDING_DEPLOYMENT: z.string().default("text-embedding-3-small"),
    ENABLE_EMBEDDINGS: bool(true),
    MOCK_AI: bool(false),
    RATING_DELAY_DAYS: int(3),
    MAX_PENDING_REQUESTS: int(3, 1),
    MIN_GUIDE_EXPERIENCE_YEARS: int(3),
    MATCH_COOLDOWN_MINUTES: int(60),
    MATCH_MAX_RUNS_PER_DAY: int(3, 1),
    MATCH_MAX_CONCURRENCY: int(5, 1),
    MAX_LLM_RUNS_PER_DAY: int(200, 1),
  })
  .superRefine((env, ctx) => {
    // MOCK_AI also switches Resend to a console/db mock, so real keys are only needed without it.
    if (env.MOCK_AI) return;
    if (env.NODE_ENV === "production" && env.APP_URL.startsWith("http://")) {
      ctx.addIssue({ code: "custom", path: ["APP_URL"], message: "must be https in production" });
    }
    const need = (key: keyof typeof env, why: string) => {
      if (!env[key]) ctx.addIssue({ code: "custom", path: [key], message: `required when MOCK_AI=false (${why})` });
    };
    need("RESEND_API_KEY", "email");
    need("RESEND_WEBHOOK_SECRET", "email webhook");
    need("FOUNDRY_ENDPOINT", "chat model");
    need("FOUNDRY_API_KEY", "chat model");
    need("LLM_DEPLOYMENT", "chat model");
    if (env.ENABLE_EMBEDDINGS) {
      need("EMBEDDING_ENDPOINT", "embeddings");
      need("EMBEDDING_API_KEY", "embeddings");
    }
  });

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function parseEnv(source: NodeJS.ProcessEnv): Env {
  const result = schema.safeParse(source);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${lines.join("\n")}`);
  }
  return result.data;
}

/** Validated env. Parsed once per process; throws with a readable list when misconfigured. */
export function env(): Env {
  return (cached ??= parseEnv(process.env));
}
