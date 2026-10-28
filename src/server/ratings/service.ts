import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { MATCHING } from "@/config/matching";
import { optionalFreeText } from "@/schemas/common";
import { db } from "@/server/db/client";
import { connectionRequests, ratings } from "@/server/db/schema";
import { bumpCounter, RATINGS_VERSION } from "@/server/profile/counters";

/** A rating can be changed for this long after it was first given. */
export const RATING_EDIT_DAYS = 7;
export const MAX_REVIEW = 600;

export const ratingInput = z.object({
  score: z.number().int().min(1, "Choose 1 to 5 stars").max(5, "Choose 1 to 5 stars"),
  review: optionalFreeText(MAX_REVIEW),
});

export type RatingResult = { ok: true; edited: boolean } | { ok: false; code: "not_found" | "not_approved" | "locked" | "invalid"; message: string };

/** Creates or edits the Seeker's single rating for one approved connection. */
export async function submitRating(args: { seekerId: string; connectionId: string; score: unknown; review?: string }): Promise<RatingResult> {
  const parsed = ratingInput.safeParse({ score: args.score, review: args.review?.trim() ? args.review : undefined });
  if (!parsed.success) return { ok: false, code: "invalid", message: parsed.error.issues[0]!.message };

  const [req] = await db().select().from(connectionRequests).where(and(eq(connectionRequests.id, args.connectionId), eq(connectionRequests.seekerId, args.seekerId))).limit(1);
  if (!req) return { ok: false, code: "not_found", message: "That connection could not be found." };
  if (req.status !== "approved") return { ok: false, code: "not_approved", message: "You can rate a Guide once you have connected with them." };

  return db().transaction(async (tx) => {
    const [existing] = await tx.select().from(ratings).where(eq(ratings.connectionRequestId, req.id)).for("update");
    if (existing) {
      if (Date.now() - existing.createdAt.getTime() > RATING_EDIT_DAYS * 86_400_000) {
        return { ok: false, code: "locked", message: `Ratings can be changed for ${RATING_EDIT_DAYS} days after you give them.` } as const;
      }
      await tx.update(ratings).set({ score: parsed.data.score, review: parsed.data.review ?? null, updatedAt: new Date() }).where(eq(ratings.id, existing.id));
    } else {
      await tx.insert(ratings).values({ connectionRequestId: req.id, seekerId: req.seekerId, guideId: req.guideId, score: parsed.data.score, review: parsed.data.review ?? null });
    }
    await bumpCounter(tx, RATINGS_VERSION); // cached matches are stale now
    return { ok: true, edited: Boolean(existing) } as const;
  });
}

export async function getOwnRating(seekerId: string, connectionId: string) {
  const [row] = await db().select().from(ratings).where(and(eq(ratings.connectionRequestId, connectionId), eq(ratings.seekerId, seekerId)));
  if (!row) return null;
  const editableUntil = new Date(row.createdAt.getTime() + RATING_EDIT_DAYS * 86_400_000);
  return { score: row.score, review: row.review, editableUntil, locked: editableUntil.getTime() < Date.now() };
}

export type GuideRatingSummary = { count: number; average: number | null; needed: number };

/** What a Guide may see: the average and count, and only once there are enough ratings to be anonymous. */
export async function guideRatingSummary(guideId: string): Promise<GuideRatingSummary> {
  const res = await db().execute(sql`select count(*)::int as count, coalesce(avg(score), 0)::float8 as avg from ratings where guide_id = ${guideId}`);
  const row = (res as unknown as { rows: { count: number; avg: number }[] }).rows[0]!;
  const min = MATCHING.rating.minCountToShow;
  return { count: row.count, average: row.count >= min ? Math.round(row.avg * 10) / 10 : null, needed: Math.max(0, min - row.count) };
}
