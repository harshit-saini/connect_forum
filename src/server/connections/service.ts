import "server-only";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { optionalFreeText } from "@/schemas/common";
import type { GuideProfileData } from "@/schemas";
import { audit } from "@/server/audit";
import { guideDisplayName } from "@/lib/display";
import { db } from "@/server/db/client";
import { blocks, connectionRequests, guideProfiles, matches, reports, unlocks, users } from "@/server/db/schema";
import { env } from "@/server/env";
import { queue } from "@/server/jobs";

export const MAX_NOTE = 300;

type Fail = { ok: false; code: "not_found" | "unavailable" | "duplicate" | "note"; message: string };

function uniqueViolation(err: unknown) {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
}

/**
 * Connects a Seeker with the Guide of one of their matches, right away: there is no approval step.
 * Records an approved connection and its unlock, then queues the e-mail with the Guide's details to the
 * Seeker, a heads-up to the Guide, and the later rating reminder. The partial unique index on the pair
 * makes a double click (or two tabs) create exactly one connection and one set of e-mails.
 */
export async function createRequest(args: { seekerId: string; matchId: string; note?: string }): Promise<{ ok: true; requestId: string } | Fail> {
  const { seekerId, matchId } = args;

  const noteResult = optionalFreeText(MAX_NOTE).safeParse(args.note?.trim() ? args.note : undefined);
  if (!noteResult.success) return { ok: false, code: "note", message: noteResult.error.issues[0]!.message };
  const note = noteResult.data;

  const [m] = await db().select().from(matches).where(and(eq(matches.id, matchId), eq(matches.seekerId, seekerId))).limit(1);
  if (!m) return { ok: false, code: "not_found", message: "That match could not be found." };

  const [guide] = await db()
    .select({ suspendedAt: users.suspendedAt, deletedAt: users.deletedAt, completed: guideProfiles.profileCompletedAt, paused: guideProfiles.matchingPaused, gDeleted: guideProfiles.deletedAt })
    .from(users)
    .innerJoin(guideProfiles, eq(guideProfiles.userId, users.id))
    .where(eq(users.id, m.guideId));
  const unavailable: Fail = { ok: false, code: "unavailable", message: "This Guide isn't available to connect right now." };
  if (!guide || guide.suspendedAt || guide.deletedAt || guide.gDeleted || !guide.completed || guide.paused) return unavailable;

  const [{ n: blocked }] = await db().select({ n: count() }).from(blocks).where(sql`(${blocks.blockerId} = ${seekerId} and ${blocks.blockedId} = ${m.guideId}) or (${blocks.blockerId} = ${m.guideId} and ${blocks.blockedId} = ${seekerId})`);
  const [{ n: reported }] = await db().select({ n: count() }).from(reports).where(sql`(${reports.reporterId} = ${seekerId} and ${reports.reportedId} = ${m.guideId}) or (${reports.reporterId} = ${m.guideId} and ${reports.reportedId} = ${seekerId})`);
  if (blocked > 0 || reported > 0) return unavailable;

  try {
    const requestId = await db().transaction(async (tx) => {
      const now = new Date();
      const [row] = await tx.insert(connectionRequests).values({ seekerId, guideId: m.guideId, matchId, note, status: "approved", decidedAt: now, approvedAt: now }).returning({ id: connectionRequests.id });
      const id = row!.id;
      const [unlock] = await tx.insert(unlocks).values({ seekerId, guideId: m.guideId, connectionRequestId: id }).onConflictDoNothing().returning({ id: unlocks.id });
      await audit(tx, { action: "connection.requested", actorId: seekerId, targetId: m.guideId, subjectType: "connection_request", subjectId: id });
      await audit(tx, { action: "connection.approved", actorId: seekerId, targetId: m.guideId, subjectType: "connection_request", subjectId: id });
      if (unlock) await audit(tx, { action: "unlock.created", actorId: seekerId, targetId: m.guideId, subjectType: "unlock", subjectId: unlock.id });
      // `shares: 2` marks a connection made after the dialog said the Seeker's address is shared (jobs queued by the
      // older flow lack it and get the address-free e-mail). Ids only: the Guide's number is decrypted when the first e-mail is sent, never stored in a job.
      await queue().enqueue(tx, "send_email", { kind: "guide_details", userId: seekerId, requestId: id }, { idempotencyKey: `guide_details:${id}` });
      await queue().enqueue(tx, "send_email", { kind: "guide_notified", userId: m.guideId, requestId: id, shares: 2 }, { idempotencyKey: `guide_notified:${id}` });
      // "How was your Guide?" goes out RATING_DELAY_DAYS later (any worker run or the daily sweep sends it).
      await queue().enqueue(tx, "rating_reminder", { userId: seekerId, requestId: id }, { runAt: new Date(now.getTime() + env().RATING_DELAY_DAYS * 86_400_000), idempotencyKey: `rating_reminder:${id}` });
      return id;
    });
    return { ok: true, requestId };
  } catch (err) {
    if (uniqueViolation(err)) return { ok: false, code: "duplicate", message: "You are already connected with this Guide." };
    throw err;
  }
}

/** Closes requests left pending by the old approval flow (nobody can answer them any more). Idempotent. */
export async function closeLegacyPending(): Promise<number> {
  const rows = await db()
    .update(connectionRequests)
    .set({ status: "cancelled", decidedAt: new Date() })
    .where(eq(connectionRequests.status, "pending"))
    .returning({ id: connectionRequests.id });
  return rows.length;
}

export type SeekerConnection = { id: string; name: string; status: string; note: string | null; createdAt: Date; approvedAt: Date | null };

export async function listSeekerConnections(seekerId: string): Promise<SeekerConnection[]> {
  const rows = await db()
    .select({ id: connectionRequests.id, data: guideProfiles.data, status: connectionRequests.status, note: connectionRequests.note, createdAt: connectionRequests.createdAt, approvedAt: connectionRequests.approvedAt })
    .from(connectionRequests)
    .innerJoin(guideProfiles, eq(guideProfiles.userId, connectionRequests.guideId))
    .where(eq(connectionRequests.seekerId, seekerId))
    .orderBy(desc(connectionRequests.createdAt));
  return rows.map(({ data, ...r }) => ({ ...r, name: guideDisplayName(data as unknown as GuideProfileData) }));
}
