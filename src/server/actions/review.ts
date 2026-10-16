"use server";
import { decide } from "@/server/connections/service";
import { kickWorker } from "@/server/jobs/kick";
import { rateLimit } from "@/server/ratelimit";
import { clientKey } from "@/server/ratelimit/ip";
import { hashToken, verifyCsrf } from "@/server/tokens";

export type ReviewActionState = { done?: "approved" | "declined"; error?: string };

/**
 * The only way a request is approved or declined. It is a POST (a server action), so opening the link
 * or having it fetched by a mail scanner cannot decide anything, and it needs the CSRF value that the
 * review page embeds for this specific token.
 */
export async function decideAction(_prev: ReviewActionState, formData: FormData): Promise<ReviewActionState> {
  const token = String(formData.get("token") ?? "");
  const csrf = String(formData.get("csrf") ?? "");
  const decision = formData.get("decision");
  if (decision !== "approve" && decision !== "decline") return { error: "Unknown action." };

  const limited = await rateLimit(`review_decide:${await clientKey()}`, 30, 600);
  if (!limited.allowed) return { error: "Too many attempts. Please try again in a few minutes." };
  if (!verifyCsrf(hashToken(token), csrf)) return { error: "This page has expired. Please reopen the link from your email." };

  const result = await decide(token, decision);
  if (!result.ok) return { error: result.message };
  kickWorker();
  return { done: result.outcome };
}
