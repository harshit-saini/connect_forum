"use server";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { faqEvents, seekerProfiles } from "@/server/db/schema";
import { rateLimit } from "@/server/ratelimit";
import { requireCompletedProfile } from "@/server/viewer";

/**
 * Records whether the FAQs answered a Seeker's question. The category comes from their saved profile, not
 * from the client. Holds no free text.
 */
export async function recordFaqOutcomeAction(outcome: "resolved" | "escalated"): Promise<{ ok: boolean }> {
  const viewer = await requireCompletedProfile();
  if (viewer.role !== "seeker" || (outcome !== "resolved" && outcome !== "escalated")) return { ok: false };
  const limited = await rateLimit(`faq_event:${viewer.id}`, 30, 3600);
  if (!limited.allowed) return { ok: false };
  const [p] = await db().select({ category: seekerProfiles.category }).from(seekerProfiles).where(eq(seekerProfiles.userId, viewer.id));
  if (!p?.category) return { ok: false };
  await db().insert(faqEvents).values({ userId: viewer.id, category: p.category, outcome });
  return { ok: true };
}
