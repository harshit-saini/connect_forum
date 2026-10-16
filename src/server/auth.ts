import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { emailOTP } from "better-auth/plugins";
import { after } from "next/server";
import { db } from "@/server/db/client";
import * as schema from "@/server/db/schema";
import { sendEmail } from "@/server/email";
import { SignInEmail } from "@/server/email/templates/sign-in";
import { env } from "@/server/env";
import { log } from "@/server/logging/logger";

const OTP_MINUTES = 10;

/** Runs after the response when inside a request; falls back to fire-and-forget in scripts/tests. */
function runAfter(fn: () => Promise<void>) {
  const safe = () => fn().catch((err) => log.error("auth.email_failed", { error: err }));
  try {
    after(safe);
  } catch {
    void safe();
  }
}

function create() {
  const e = env();
  return betterAuth({
    baseURL: e.APP_URL,
    secret: e.AUTH_SECRET,
    trustedOrigins: [e.APP_URL],
    database: drizzleAdapter(db(), {
      provider: "pg",
      schema: {
        user: schema.users,
        session: schema.sessions,
        account: schema.accounts,
        verification: schema.verifications,
        rateLimit: schema.authRateLimits,
      },
    }),
    advanced: {
      database: { generateId: "uuid" },
      useSecureCookies: e.NODE_ENV === "production",
      // Explicit so behaviour is identical in tests (Better Auth disables these when NODE_ENV=test).
      disableCSRFCheck: false,
      disableOriginCheck: false,
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax" },
    },
    user: {
      additionalFields: {
        suspendedAt: { type: "date", required: false, input: false },
        deletedAt: { type: "date", required: false, input: false },
      },
    },
    session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24, cookieCache: { enabled: false } },
    rateLimit: {
      enabled: true,
      storage: "database",
      modelName: "rateLimit",
      window: 60,
      max: 60,
      customRules: {
        "/email-otp/send-verification-otp": { window: 600, max: 5 },
        "/sign-in/email-otp": { window: 600, max: 10 },
      },
    },
    plugins: [
      emailOTP({
        otpLength: 6,
        expiresIn: OTP_MINUTES * 60,
        allowedAttempts: 5,
        storeOTP: "hashed",
        async sendVerificationOTP({ email, otp, type }) {
          if (type !== "sign-in") return;
          // The link carries the code in the URL fragment: fragments are never sent to servers or logs,
          // and opening the link only pre-fills the form, so email link-scanners cannot consume the code.
          const link = `${e.APP_URL}/sign-in#email=${encodeURIComponent(email)}&code=${otp}`;
          runAfter(() =>
            sendEmail({
              to: email,
              subject: `Your Connect sign-in code: ${otp}`,
              kind: "signin-otp",
              react: SignInEmail({ otp, link, minutes: OTP_MINUTES }),
            }),
          );
        },
      }),
      nextCookies(), // must be last
    ],
  });
}

type Auth = ReturnType<typeof create>;
const g = globalThis as unknown as { __auth?: Auth };

export function auth(): Auth {
  return (g.__auth ??= create());
}
