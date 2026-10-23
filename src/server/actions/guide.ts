"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db/client";
import { guideProfiles } from "@/server/db/schema";
import { bumpCounter, GUIDE_POOL_VERSION } from "@/server/profile/counters";
import { requireCompletedProfile } from "@/server/viewer";

/** Pauses or resumes matching. Bumps the pool version so cached match results are refreshed. */
export async function setMatchingPausedAction(paused: boolean): Promise<{ ok: boolean; error?: string }> {
  const viewer = await requireCompletedProfile();
  if (viewer.role !== "guide") return { ok: false, error: "Only Guides can do this." };
  await db().transaction(async (tx) => {
    await tx.update(guideProfiles).set({ matchingPaused: paused, updatedAt: new Date() }).where(eq(guideProfiles.userId, viewer.id));
    await bumpCounter(tx, GUIDE_POOL_VERSION);
  });
  revalidatePath("/guide");
  return { ok: true };
}
