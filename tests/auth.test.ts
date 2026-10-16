import { desc, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { auth } from "@/server/auth";
import { db } from "@/server/db/client";
import { authRateLimits, devOutbox, users } from "@/server/db/schema";

const origin = "http://localhost:3000";

function post(path: string, body: unknown) {
  return auth().handler(
    new Request(`${origin}/api/auth${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify(body),
    }),
  );
}

async function latestCode(email: string) {
  // The email is sent after the response, so poll briefly.
  for (let i = 0; i < 40; i++) {
    const [row] = await db().select().from(devOutbox).where(eq(devOutbox.to, email)).orderBy(desc(devOutbox.createdAt)).limit(1);
    if (row) return /\b(\d{6})\b/.exec(row.text)![1]!;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("no email captured");
}

describe("passwordless sign-in", () => {
  const email = `seeker-${Date.now()}@example.com`;

  beforeAll(async () => {
    await db().delete(devOutbox);
    await db().delete(authRateLimits);
  });

  it("emails a code, rejects a wrong one, and signs in with the right one", async () => {
    const sent = await post("/email-otp/send-verification-otp", { email, type: "sign-in" });
    expect(sent.status).toBe(200);
    const code = await latestCode(email);

    const wrong = await post("/sign-in/email-otp", { email, otp: code === "000000" ? "111111" : "000000" });
    expect(wrong.status).toBeGreaterThanOrEqual(400);

    const ok = await post("/sign-in/email-otp", { email, otp: code });
    expect(ok.status).toBe(200);
    const cookie = ok.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);

    const [user] = await db().select().from(users).where(eq(users.email, email));
    expect(user?.emailVerified).toBe(true);
    expect(user?.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("rejects cross-origin state-changing requests that carry the session cookie (CSRF)", async () => {
    const e = `csrf-${Date.now()}@example.com`;
    await post("/email-otp/send-verification-otp", { email: e, type: "sign-in" });
    const ok = await post("/sign-in/email-otp", { email: e, otp: await latestCode(e) });
    const cookie = (ok.headers.get("set-cookie") ?? "").split(",").map((c) => c.split(";")[0]).join("; ");
    const res = await auth().handler(
      new Request(`${origin}/api/auth/sign-out`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://evil.example", cookie },
        body: "{}",
      }),
    );
    expect(res.status).toBe(403);
  });
});
