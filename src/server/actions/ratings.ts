"use server";
import { revalidatePath } from "next/cache";
import { submitRating } from "@/server/ratings/service";
import { rateLimit } from "@/server/ratelimit";
import { requireCompletedProfile } from "@/server/viewer";

export type RatingActionState = { done?: boolean; edited?: boolean; error?: string };

export async function submitRatingAction(connectionId: string, _prev: RatingActionState, formData: FormData): Promise<RatingActionState> {
  const viewer = await requireCompletedProfile();
  if (viewer.role !== "seeker") return { error: "Only Seekers can rate." };
  if (!(await rateLimit(`rate:${viewer.id}`, 20, 3600)).allowed) return { error: "Too many attempts. Please try again later." };
  const score = Number(formData.get("score"));
  const result = await submitRating({ seekerId: viewer.id, connectionId, score: Number.isFinite(score) ? score : 0, review: String(formData.get("review") ?? "") });
  if (!result.ok) return { error: result.message };
  revalidatePath(`/seeker/rate/${connectionId}`);
  return { done: true, edited: result.edited };
}
