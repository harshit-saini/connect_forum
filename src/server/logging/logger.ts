import "server-only";

const SENSITIVE_KEY = /(email|phone|number|token|otp|code|secret|password|authorization|cookie|note|linkedin|name|review|text)/i;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// Boundaries keep UUIDs and ids (digit runs next to letters or hyphens) from being mistaken for phone numbers.
const PHONE_RE = /(?<![\w-])\+?\d[\d\s().-]{8,}\d(?![\w-])/g;

/** Removes PII from arbitrary log values. Sensitive keys are dropped; emails/phones in strings are masked. */
export function redact(value: unknown, depth = 0): unknown {
  if (value == null) return value;
  if (typeof value === "string") return value.replace(EMAIL_RE, "[email]").replace(PHONE_RE, "[phone]");
  if (typeof value !== "object") return value;
  if (depth > 4) return "[truncated]";
  if (value instanceof Error) return { name: value.name, message: redact(value.message) };
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = SENSITIVE_KEY.test(k) ? "[redacted]" : redact(v, depth + 1);
  }
  return out;
}

type Level = "debug" | "info" | "warn" | "error";

function write(level: Level, msg: string, fields?: Record<string, unknown>) {
  if (process.env.NODE_ENV === "test" && !process.env.LOG_IN_TESTS) return;
  const line = JSON.stringify({ level, time: new Date().toISOString(), msg: redact(msg), ...(redact(fields ?? {}) as object) });
  (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(line);
}

export const log = {
  debug: (msg: string, f?: Record<string, unknown>) => write("debug", msg, f),
  info: (msg: string, f?: Record<string, unknown>) => write("info", msg, f),
  warn: (msg: string, f?: Record<string, unknown>) => write("warn", msg, f),
  error: (msg: string, f?: Record<string, unknown>) => write("error", msg, f),
};
