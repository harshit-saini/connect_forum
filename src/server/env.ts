import "server-only";
import { z } from "zod";
import { MEMBER_ID_SHAPE, parseMemberIds } from "@/lib/member-id";

const bool = (def: boolean) =>
  z
    .enum(["true", "false", "1", "0"])
    .optional()
    .transform((v) => (v === undefined ? def : v === "true" || v === "1"));

const int = (def: number, min = 0) => z.coerce.number().int().min(min).default(def);

const base64Key32 = z
  .string()
  .refine((v) => Buffer.from(v, "base64").length === 32, "must be 32 bytes, base64-encoded (openssl rand -base64 32)");

/** A list of member IDs from an environment variable, normalised (upper-case, no spaces) and de-duplicated. */
const memberIds = z.string().default("").transform(parseMemberIds);

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
    /** Version tag stored with ciphertext made by VAULT_ENCRYPTION_KEY. Bump it when rotating. */
    VAULT_KEY_VERSION: int(1, 1),
    /** Retired keys, still needed to decrypt old rows until rotation finishes: "1:<base64>,2:<base64>". */
    VAULT_PREVIOUS_KEYS: z.string().default(""),
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
    /** The IDs allowed to register as a Guide / as a Seeker (comma- or newline-separated). Empty means nobody can. */
    GUIDE_MEMBER_IDS: memberIds,
    SEEKER_MEMBER_IDS: memberIds,
    /**
     * Master switch for every AI feature. `false` removes the LLM rerank and the embeddings: matching uses
     * only the profile answers, and no Foundry settings are needed.
     */
    AI_ENABLED: bool(true),
    /**
     * Whether the UI describes matching as AI-driven. Unset means "follow AI_ENABLED". Only presentation
     * copy changes; consent, privacy and terms text always describe what really happens.
     */
    AI_BRANDING: z
      .enum(["true", "false", "1", "0"])
      .optional()
      .transform((v) => (v === undefined ? undefined : v === "true" || v === "1")),
    /** Which API the chat deployment speaks: Claude (Anthropic Messages) or an OpenAI model (chat completions). */
    LLM_PROVIDER: z.enum(["anthropic", "openai"]).default("anthropic"),
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
    for (const key of ["GUIDE_MEMBER_IDS", "SEEKER_MEMBER_IDS"] as const) {
      const bad = env[key].find((id) => !MEMBER_ID_SHAPE.test(id));
      if (bad) ctx.addIssue({ code: "custom", path: [key], message: `"${bad}" is not a valid member ID (letters, digits, . _ / - only, 2 to 40 characters)` });
    }
    for (const entry of env.VAULT_PREVIOUS_KEYS.split(",").map((e) => e.trim()).filter(Boolean)) {
      const [version, key] = entry.split(":");
      if (!/^\d+$/.test(version ?? "") || Buffer.from(key ?? "", "base64").length !== 32 || Number(version) === env.VAULT_KEY_VERSION) {
        ctx.addIssue({ code: "custom", path: ["VAULT_PREVIOUS_KEYS"], message: "expected 'version:base64key' pairs with 32-byte keys and versions different from VAULT_KEY_VERSION" });
      }
    }
    // MOCK_AI also switches Resend to a database mailbox, so on a real Vercel production deploy it would
    // silently stop all e-mail. Refuse that combination outright.
    if (env.MOCK_AI && process.env.VERCEL_ENV === "production") {
      ctx.addIssue({ code: "custom", path: ["MOCK_AI"], message: "must be false on a production deployment" });
    }
    if (env.MOCK_AI) return;
    if (env.NODE_ENV === "production" && env.APP_URL.startsWith("http://")) {
      ctx.addIssue({ code: "custom", path: ["APP_URL"], message: "must be https in production" });
    }
    const need = (key: keyof typeof env, why: string) => {
      if (!env[key]) ctx.addIssue({ code: "custom", path: [key], message: `required when MOCK_AI=false (${why})` });
    };
    // The hard member-ID check fails closed: with an empty list no one could ever register.
    if (env.GUIDE_MEMBER_IDS.length === 0) ctx.addIssue({ code: "custom", path: ["GUIDE_MEMBER_IDS"], message: "required when MOCK_AI=false (member-ID check)" });
    if (env.SEEKER_MEMBER_IDS.length === 0) ctx.addIssue({ code: "custom", path: ["SEEKER_MEMBER_IDS"], message: "required when MOCK_AI=false (member-ID check)" });
    need("RESEND_API_KEY", "email");
    need("RESEND_WEBHOOK_SECRET", "email webhook");
    if (env.AI_ENABLED) {
      need("FOUNDRY_ENDPOINT", "chat model");
      need("FOUNDRY_API_KEY", "chat model");
      need("LLM_DEPLOYMENT", "chat model");
      if (env.ENABLE_EMBEDDINGS) {
        need("EMBEDDING_ENDPOINT", "embeddings");
        need("EMBEDDING_API_KEY", "embeddings");
      }
    }
  })
  .transform((e) => ({
    ...e,
    // With AI off there are no vectors either, so everything that asks "are embeddings on?" gets the right answer.
    ENABLE_EMBEDDINGS: e.ENABLE_EMBEDDINGS && e.AI_ENABLED,
    AI_BRANDING: e.AI_BRANDING ?? e.AI_ENABLED,
  }));

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function parseEnv(source: NodeJS.ProcessEnv): Env {
  // `KEY=` in a .env file yields "", which should behave like an unset variable.
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== ""));
  const result = schema.safeParse(cleaned);
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
