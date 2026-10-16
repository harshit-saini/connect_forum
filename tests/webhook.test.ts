import { createHmac } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { emailEvents } from "@/server/db/schema";
import { parseEvent, verifyWebhook } from "@/server/email/webhook";

const SECRET = process.env.RESEND_WEBHOOK_SECRET!;
const sign = (id: string, ts: string, body: string, secret = SECRET) =>
  "v1," + createHmac("sha256", Buffer.from(secret.slice(6), "base64")).update(`${id}.${ts}.${body}`).digest("base64");
const now = () => String(Math.floor(Date.now() / 1000));

async function post(body: object | string, over: { id?: string; ts?: string; sig?: string; omit?: boolean } = {}) {
  const { POST } = await import("@/app/api/webhooks/resend/route");
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  const id = over.id ?? `msg_${Math.random().toString(36).slice(2)}`;
  const ts = over.ts ?? now();
  const headers: Record<string, string> = over.omit ? {} : { "svix-id": id, "svix-timestamp": ts, "svix-signature": over.sig ?? sign(id, ts, raw) };
  return POST(new Request("http://localhost/api/webhooks/resend", { method: "POST", headers, body: raw }));
}

beforeAll(async () => {
  await db().delete(emailEvents);
});

describe("verifyWebhook", () => {
  const base = { secret: SECRET, id: "msg_1", timestamp: now(), body: "{}" };
  it("accepts a correct signature, including one of several during key rotation", () => {
    const good = sign(base.id, base.timestamp, base.body);
    expect(verifyWebhook({ ...base, signature: good })).toBe(true);
    expect(verifyWebhook({ ...base, signature: `v1,AAAA ${good}` })).toBe(true);
  });
  it("rejects wrong, missing, stale and future-dated signatures", () => {
    const good = sign(base.id, base.timestamp, base.body);
    expect(verifyWebhook({ ...base, signature: sign(base.id, base.timestamp, "{\"tampered\":1}") })).toBe(false);
    expect(verifyWebhook({ ...base, id: "msg_other", signature: good })).toBe(false);
    expect(verifyWebhook({ ...base, signature: null })).toBe(false);
    expect(verifyWebhook({ ...base, signature: "v2," + good.slice(3) })).toBe(false);
    const old = String(Math.floor(Date.now() / 1000) - 3600);
    expect(verifyWebhook({ ...base, timestamp: old, signature: sign(base.id, old, base.body) })).toBe(false);
    const future = String(Math.floor(Date.now() / 1000) + 3600);
    expect(verifyWebhook({ ...base, timestamp: future, signature: sign(base.id, future, base.body) })).toBe(false);
    expect(verifyWebhook({ ...base, signature: sign(base.id, base.timestamp, base.body, "whsec_" + Buffer.from("another-secret-another-secret-12").toString("base64")) })).toBe(false);
  });
});

describe("parseEvent", () => {
  it("keeps the type, id and recipient domain only", () => {
    const e = parseEvent({ type: "email.bounced", data: { email_id: "abc", to: ["Someone@Example.COM"], subject: "secret subject", bounce: { type: "Permanent", subType: "General" } } })!;
    expect(e).toMatchObject({ type: "email.bounced", messageId: "abc", recipientDomain: "example.com", detail: { bounceType: "Permanent" } });
    expect(JSON.stringify(e)).not.toMatch(/someone|secret subject/i);
    expect(parseEvent({ type: "email.opened", data: {} })).toBeNull();
    expect(parseEvent(null)).toBeNull();
  });
});

describe("POST /api/webhooks/resend", () => {
  it("rejects bad or missing signatures without touching the database", async () => {
    const body = { type: "email.delivered", data: { email_id: "rej_1", to: ["a@b.com"] } };
    expect((await post(body, { sig: "v1,AAAA" })).status).toBe(401);
    expect((await post(body, { omit: true })).status).toBe(401);
    expect((await post(body, { ts: String(Math.floor(Date.now() / 1000) - 7200) })).status).toBe(401);
    expect(await db().select().from(emailEvents).where(eq(emailEvents.providerMessageId, "rej_1"))).toHaveLength(0);
  });

  it("logs delivered, bounced and complained events without storing addresses, and ignores duplicates", async () => {
    for (const type of ["email.delivered", "email.bounced", "email.complained"]) {
      const res = await post({ type, data: { email_id: `evt_${type}`, to: ["private.person@example.org"], bounce: { type: "Permanent" } } });
      expect(res.status).toBe(204);
    }
    await post({ type: "email.delivered", data: { email_id: "evt_email.delivered", to: ["private.person@example.org"] } }); // retried delivery
    const rows = await db().select().from(emailEvents);
    expect(rows.map((r) => r.type).sort()).toEqual(["email.bounced", "email.complained", "email.delivered"]);
    expect(rows.every((r) => r.recipientDomain === "example.org")).toBe(true);
    expect(JSON.stringify(rows)).not.toMatch(/private\.person/);
  });

  it("acknowledges event types it does not track, and rejects non-JSON", async () => {
    expect((await post({ type: "email.opened", data: { email_id: "x" } })).status).toBe(204);
    expect((await post("not json")).status).toBe(400);
  });
});
