import { and, eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { emailEvents } from "@/server/db/schema";
import { parseEvent, verifyWebhook } from "@/server/email/webhook";
import { env } from "@/server/env";
import { log } from "@/server/logging/logger";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const secret = env().RESEND_WEBHOOK_SECRET;
  if (!secret) return new Response("Webhook not configured", { status: 503 });

  // The signature covers the exact bytes received, so read the raw text before parsing.
  const body = await req.text();
  const ok = verifyWebhook({
    secret,
    id: req.headers.get("svix-id"),
    timestamp: req.headers.get("svix-timestamp"),
    signature: req.headers.get("svix-signature"),
    body,
  });
  if (!ok) return new Response("Invalid signature", { status: 401 });

  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  const event = parseEvent(json);
  if (!event) return new Response(null, { status: 204 }); // an event type we don't track

  // Webhooks are retried: record each (message, type) once.
  if (event.messageId) {
    const [dupe] = await db().select({ id: emailEvents.id }).from(emailEvents).where(and(eq(emailEvents.providerMessageId, event.messageId), eq(emailEvents.type, event.type))).limit(1);
    if (dupe) return new Response(null, { status: 204 });
  }
  await db().insert(emailEvents).values({ providerMessageId: event.messageId, type: event.type, recipientDomain: event.recipientDomain, payload: event.detail });
  if (event.type === "email.bounced" || event.type === "email.complained" || event.type === "email.failed") {
    log.warn("email.delivery_problem", { type: event.type, domain: event.recipientDomain });
  }
  return new Response(null, { status: 204 });
}
