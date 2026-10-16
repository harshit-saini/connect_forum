import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "@/server/env";

/** 256 bits of randomness, URL-safe. Shown once (in an email) and never stored. */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

/** What the database stores. Tokens are high-entropy, so an unsalted SHA-256 is appropriate. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;
export const looksLikeToken = (t: string) => TOKEN_SHAPE.test(t);

/** CSRF value for the review form, bound to this token's hash and the server secret. */
export function csrfFor(tokenHash: string): string {
  return createHmac("sha256", env().AUTH_SECRET).update(`review-csrf:${tokenHash}`).digest("base64url");
}

export function verifyCsrf(tokenHash: string, given: string): boolean {
  const a = Buffer.from(csrfFor(tokenHash));
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}
