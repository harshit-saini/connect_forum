"use server";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { connectionRequests } from "@/server/db/schema";
import { rateLimit } from "@/server/ratelimit";
import { clientKey } from "@/server/ratelimit/ip";
import { applySafetyAction, safetyInput } from "@/server/safety/service";
import { hashToken, looksLikeToken, verifyCsrf } from "@/server/tokens";

export type SafetyActionState = { done?: "report" | "block"; error?: string };

/** Lets a Guide report or block a Seeker straight from the review page. Authenticated by the link's token. */
export async function reviewSafetyAction(_prev: SafetyActionState, formData: FormData): Promise<SafetyActionState> {
  const token = String(formData.get("token") ?? "");
  const csrf = String(formData.get("csrf") ?? "");
  if (!looksLikeToken(token) || !verifyCsrf(hashToken(token), csrf)) return { error: "This page has expired. Please reopen the link from your email." };
  if (!(await rateLimit(`review_safety:${await clientKey()}`, 10, 3600)).allowed) return { error: "Too many attempts. Please try again later." };

  const parsed = safetyInput.safeParse({ action: formData.get("action"), reason: formData.get("reason") || undefined, details: formData.get("details") || undefined });
  if (!parsed.success) return { error: "Please choose a reason." };

  const [r] = await db().select().from(connectionRequests).where(eq(connectionRequests.tokenHash, hashToken(token))).limit(1);
  if (!r) return { error: "This link isn't valid." };
  const result = await applySafetyAction({ actorId: r.guideId, otherId: r.seekerId, input: parsed.data });
  return result.ok ? { done: parsed.data.action } : { error: result.message };
}
