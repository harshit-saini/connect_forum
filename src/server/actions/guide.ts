"use server";
import { revalidatePath } from "next/cache";
import type { GuideProfileData } from "@/schemas";
import { loadProfileState, saveStep } from "@/server/profile/service";
import { requireCompletedProfile } from "@/server/viewer";

/** Pauses or resumes matching. Goes through the normal profile save so versions and pools stay correct. */
export async function setMatchingPausedAction(paused: boolean): Promise<{ ok: boolean; error?: string }> {
  const viewer = await requireCompletedProfile();
  if (viewer.role !== "guide") return { ok: false, error: "Only Guides can do this." };
  const state = await loadProfileState(viewer.id, "guide");
  const current = (state.data as unknown as GuideProfileData).availability;
  const result = await saveStep({ userId: viewer.id, role: "guide", step: "availability", values: { ...current, pauseMatching: paused } });
  revalidatePath("/guide");
  return result.ok ? { ok: true } : { ok: false, error: "Could not update. Please try again." };
}
