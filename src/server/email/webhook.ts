import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

const TOLERANCE_SECONDS = 5 * 60;

/**
 * Verifies a Svix-style webhook signature (the scheme Resend uses): HMAC-SHA256 of
 * `${svix-id}.${svix-timestamp}.${rawBody}` with the base64 secret that follows "whsec_".
 * The header may carry several space-separated `v1,<signature>` entries (key rotation).
 */
export function verifyWebhook(args: { secret: string; id: string | null; timestamp: string | null; signature: string | null; body: string; now?: number }): boolean {
  const { secret, id, timestamp, signature, body } = args;
  if (!id || !timestamp || !signature) return false;
  const ts = Number(timestamp);
  const now = Math.floor((args.now ?? Date.now()) / 1000);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > TOLERANCE_SECONDS) return false;

  const key = Buffer.from(secret.startsWith("whsec_") ? secret.slice(6) : secret, "base64");
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest();
  return signature.split(" ").some((part) => {
    const [version, sig] = part.split(",");
    if (version !== "v1" || !sig) return false;
    const given = Buffer.from(sig, "base64");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

export type ParsedEvent = { type: string; messageId: string | null; recipientDomain: string | null; detail: Record<string, unknown> };

const TRACKED = new Set(["email.sent", "email.delivered", "email.delivery_delayed", "email.bounced", "email.complained", "email.failed", "email.suppressed"]);

/** Reduces a Resend event to what we keep: no addresses, subjects or bodies. */
export function parseEvent(raw: unknown): ParsedEvent | null {
  const e = raw as { type?: string; data?: { email_id?: string; to?: string[] | string; bounce?: { type?: string; subType?: string }; tags?: unknown } };
  if (!e?.type || !TRACKED.has(e.type)) return null;
  const to = Array.isArray(e.data?.to) ? e.data!.to[0] : e.data?.to;
  const domain = typeof to === "string" && to.includes("@") ? to.split("@").pop()!.toLowerCase() : null;
  return {
    type: e.type,
    messageId: e.data?.email_id ?? null,
    recipientDomain: domain,
    detail: { bounceType: e.data?.bounce?.type, bounceSubType: e.data?.bounce?.subType, tags: e.data?.tags },
  };
}
