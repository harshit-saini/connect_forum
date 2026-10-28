import "server-only";
import { and, count, desc, eq, lt, sql } from "drizzle-orm";
import { optionalFreeText } from "@/schemas/common";
import type { SeekerProfileData } from "@/schemas";
import { audit } from "@/server/audit";
import { db } from "@/server/db/client";
import { blocks, connectionRequests, guideProfiles, matches, reports, seekerProfiles, unlocks, userAliases, users } from "@/server/db/schema";
import { env } from "@/server/env";
import { queue } from "@/server/jobs";
import { publicSeeker, type PublicSeeker } from "@/server/matching/public";
import { generateToken, hashToken, looksLikeToken } from "@/server/tokens";
import { sealToString } from "@/server/vault";

export const REQUEST_TTL_DAYS = 7;
export const MAX_NOTE = 300;

type Fail = { ok: false; code: "not_found" | "unavailable" | "limit" | "duplicate" | "note"; message: string };

function uniqueViolation(err: unknown) {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
}

/** Creates a pending request for a match and queues the Guide's review e-mail. */
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
  const unavailable: Fail = { ok: false, code: "unavailable", message: "This Guide isn't taking new requests right now." };
  if (!guide || guide.suspendedAt || guide.deletedAt || guide.gDeleted || !guide.completed || guide.paused) return unavailable;

  const [{ n: blocked }] = await db().select({ n: count() }).from(blocks).where(sql`(${blocks.blockerId} = ${seekerId} and ${blocks.blockedId} = ${m.guideId}) or (${blocks.blockerId} = ${m.guideId} and ${blocks.blockedId} = ${seekerId})`);
  const [{ n: reported }] = await db().select({ n: count() }).from(reports).where(sql`(${reports.reporterId} = ${seekerId} and ${reports.reportedId} = ${m.guideId}) or (${reports.reporterId} = ${m.guideId} and ${reports.reportedId} = ${seekerId})`);
  if (blocked > 0 || reported > 0) return unavailable;

  const [{ n: pending }] = await db().select({ n: count() }).from(connectionRequests).where(and(eq(connectionRequests.seekerId, seekerId), eq(connectionRequests.status, "pending")));
  const max = env().MAX_PENDING_REQUESTS;
  if (pending >= max) return { ok: false, code: "limit", message: `You can have up to ${max} pending requests at a time. Wait for a reply before sending another.` };

  const token = generateToken();
  const expiresAt = new Date(Date.now() + REQUEST_TTL_DAYS * 86_400_000);
  try {
    const requestId = await db().transaction(async (tx) => {
      const [row] = await tx.insert(connectionRequests).values({ seekerId, guideId: m.guideId, matchId, note, tokenHash: hashToken(token), expiresAt }).returning({ id: connectionRequests.id });
      await audit(tx, { action: "connection.requested", actorId: seekerId, targetId: m.guideId, subjectType: "connection_request", subjectId: row!.id });
      // The raw token exists only in this sealed job payload until the e-mail is sent, then it is scrubbed.
      await queue().enqueue(tx, "send_email", { kind: "connection_request", userId: m.guideId, requestId: row!.id, sealedToken: sealToString(token, row!.id) }, { idempotencyKey: `req_email:${row!.id}` });
      return row!.id;
    });
    return { ok: true, requestId };
  } catch (err) {
    if (uniqueViolation(err)) return { ok: false, code: "duplicate", message: "You already have an open request with this Guide." };
    throw err;
  }
}

export type ReviewState =
  | { state: "invalid" }
  | { state: "expired" }
  | { state: "answered"; outcome: "approved" | "declined" | "expired" | "cancelled" }
  | { state: "open"; requestId: string; tokenHash: string; seekerAlias: string; seeker: PublicSeeker; note: string | null; expiresAt: Date };

/** Read-only lookup for the review page. Never consumes the token, so link scanners are harmless. */
export async function loadReview(token: string): Promise<ReviewState> {
  if (!looksLikeToken(token)) return { state: "invalid" };
  const tokenHash = hashToken(token);
  const [r] = await db().select().from(connectionRequests).where(eq(connectionRequests.tokenHash, tokenHash)).limit(1);
  if (!r) return { state: "invalid" };
  if (r.status !== "pending" || r.tokenUsedAt) return { state: "answered", outcome: (r.status === "pending" ? "approved" : r.status) as "approved" | "declined" | "expired" | "cancelled" };
  if (r.expiresAt.getTime() < Date.now()) return { state: "expired" };

  const [profile] = await db().select().from(seekerProfiles).where(eq(seekerProfiles.userId, r.seekerId)).limit(1);
  const [alias] = await db().select().from(userAliases).where(eq(userAliases.userId, r.seekerId)).limit(1);
  if (!profile || !alias) return { state: "invalid" };
  return { state: "open", requestId: r.id, tokenHash, seekerAlias: alias.alias, seeker: publicSeeker(profile.data as unknown as SeekerProfileData), note: r.note, expiresAt: r.expiresAt };
}

export type DecideResult =
  | { ok: true; outcome: "approved" | "declined" }
  | { ok: false; code: "invalid" | "expired" | "answered" | "unavailable"; message: string };

/**
 * Records the Guide's decision. The request row is locked, the token must still be unused and
 * unexpired, and everything (status, unlock, audit, e-mails, capacity) commits atomically.
 */
export async function decide(token: string, decision: "approve" | "decline"): Promise<DecideResult> {
  if (!looksLikeToken(token)) return { ok: false, code: "invalid", message: "This link isn't valid." };
  const tokenHash = hashToken(token);

  return db().transaction(async (tx) => {
    const locked = await tx.execute(sql`select id from connection_requests where token_hash = ${tokenHash} for update`);
    const lockedId = (locked as unknown as { rows: { id: string }[] }).rows[0]?.id;
    if (!lockedId) return { ok: false, code: "invalid", message: "This link isn't valid." } as const;
    const [r] = await tx.select().from(connectionRequests).where(eq(connectionRequests.id, lockedId));
    if (!r) return { ok: false, code: "invalid", message: "This link isn't valid." } as const;

    if (r.status !== "pending" || r.tokenUsedAt) return { ok: false, code: "answered", message: "You've already responded to this request." } as const;
    if (r.expiresAt.getTime() < Date.now()) return { ok: false, code: "expired", message: "This request has expired." } as const;

    const now = new Date();
    if (decision === "decline") {
      await tx.update(connectionRequests).set({ status: "declined", decidedAt: now, tokenUsedAt: now }).where(eq(connectionRequests.id, r.id));
      await audit(tx, { action: "connection.declined", actorId: r.guideId, targetId: r.seekerId, subjectType: "connection_request", subjectId: r.id });
      await queue().enqueue(tx, "send_email", { kind: "request_declined", userId: r.seekerId, requestId: r.id }, { idempotencyKey: `req_declined:${r.id}` });
      return { ok: true, outcome: "declined" } as const;
    }

    const [guide] = await tx
      .select({ suspendedAt: users.suspendedAt, deletedAt: users.deletedAt })
      .from(users)
      .innerJoin(guideProfiles, eq(guideProfiles.userId, users.id))
      .where(eq(users.id, r.guideId));
    if (!guide || guide.suspendedAt || guide.deletedAt) return { ok: false, code: "unavailable", message: "This request can no longer be approved." } as const;

    await tx.update(connectionRequests).set({ status: "approved", decidedAt: now, approvedAt: now, tokenUsedAt: now }).where(eq(connectionRequests.id, r.id));
    const [unlock] = await tx.insert(unlocks).values({ seekerId: r.seekerId, guideId: r.guideId, connectionRequestId: r.id }).onConflictDoNothing().returning({ id: unlocks.id });
    await audit(tx, { action: "connection.approved", actorId: r.guideId, targetId: r.seekerId, subjectType: "connection_request", subjectId: r.id });
    if (unlock) await audit(tx, { action: "unlock.created", actorId: r.guideId, targetId: r.seekerId, subjectType: "unlock", subjectId: unlock.id });
    await queue().enqueue(tx, "send_email", { kind: "request_approved", userId: r.seekerId, requestId: r.id }, { idempotencyKey: `req_approved:${r.id}` });
    // "How was your Guide?" goes out RATING_DELAY_DAYS later (any worker run or the daily sweep sends it).
    await queue().enqueue(tx, "rating_reminder", { userId: r.seekerId, requestId: r.id }, { runAt: new Date(now.getTime() + env().RATING_DELAY_DAYS * 86_400_000), idempotencyKey: `rating_reminder:${r.id}` });
    return { ok: true, outcome: "approved" } as const;
  });
}

/** Expires overdue pending requests and tells the Seekers (generically). Idempotent. */
export async function expireRequests(): Promise<number> {
  const rows = await db()
    .update(connectionRequests)
    .set({ status: "expired", decidedAt: new Date() })
    .where(and(eq(connectionRequests.status, "pending"), lt(connectionRequests.expiresAt, new Date())))
    .returning({ id: connectionRequests.id, seekerId: connectionRequests.seekerId, guideId: connectionRequests.guideId });
  for (const r of rows) {
    await audit(db(), { action: "connection.expired", targetId: r.guideId, actorId: r.seekerId, subjectType: "connection_request", subjectId: r.id });
    await queue().enqueue(db(), "send_email", { kind: "request_expired", userId: r.seekerId, requestId: r.id }, { idempotencyKey: `req_expired:${r.id}` });
  }
  return rows.length;
}

export type SeekerConnection = { id: string; alias: string; status: string; note: string | null; createdAt: Date; expiresAt: Date; approvedAt: Date | null };

export async function listSeekerConnections(seekerId: string): Promise<SeekerConnection[]> {
  return db()
    .select({ id: connectionRequests.id, alias: userAliases.alias, status: connectionRequests.status, note: connectionRequests.note, createdAt: connectionRequests.createdAt, expiresAt: connectionRequests.expiresAt, approvedAt: connectionRequests.approvedAt })
    .from(connectionRequests)
    .innerJoin(userAliases, eq(userAliases.userId, connectionRequests.guideId))
    .where(eq(connectionRequests.seekerId, seekerId))
    .orderBy(desc(connectionRequests.createdAt));
}
