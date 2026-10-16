import "server-only";
import { and, eq, or } from "drizzle-orm";
import type { GuideProfileData } from "@/schemas";
import { audit } from "@/server/audit";
import { db } from "@/server/db/client";
import { blocks, connectionRequests, guideProfiles, unlocks, users } from "@/server/db/schema";
import { decryptPhoneForReveal } from "@/server/vault/reveal";

export type RevealResult =
  | { ok: true; phone: string; contactPreference: string; bestTime: string }
  | { ok: false; code: "not_found" | "not_approved" | "unavailable" };

const DENY_REASONS = { not_found: "no_such_connection", not_approved: "not_approved", unavailable: "guide_unavailable" } as const;

/**
 * Decrypts a Guide's number for the Seeker they approved. All of these must hold:
 *  - the connection belongs to this Seeker and is approved,
 *  - an unlock exists for this exact Seeker–Guide pair,
 *  - the Guide is not suspended or deleted, and neither side has blocked the other.
 * Every outcome is audited (ids and reason only: never the number). The caller rate-limits.
 */
export async function revealNumber(args: { seekerId: string; connectionId: string }): Promise<RevealResult> {
  const { seekerId, connectionId } = args;
  const deny = async (code: keyof typeof DENY_REASONS, guideId?: string): Promise<RevealResult> => {
    await audit(db(), { action: "phone.reveal_denied", actorId: seekerId, targetId: guideId ?? null, subjectType: "connection_request", subjectId: connectionId, metadata: { reason: DENY_REASONS[code] } });
    return { ok: false, code };
  };

  const [req] = await db().select().from(connectionRequests).where(and(eq(connectionRequests.id, connectionId), eq(connectionRequests.seekerId, seekerId))).limit(1);
  if (!req) return deny("not_found");
  if (req.status !== "approved") return deny("not_approved", req.guideId);

  const [unlock] = await db().select().from(unlocks).where(and(eq(unlocks.seekerId, seekerId), eq(unlocks.guideId, req.guideId), eq(unlocks.connectionRequestId, req.id))).limit(1);
  if (!unlock) return deny("not_approved", req.guideId);

  const [guide] = await db()
    .select({ suspendedAt: users.suspendedAt, deletedAt: users.deletedAt, data: guideProfiles.data, gDeleted: guideProfiles.deletedAt })
    .from(users)
    .innerJoin(guideProfiles, eq(guideProfiles.userId, users.id))
    .where(eq(users.id, req.guideId));
  if (!guide || guide.suspendedAt || guide.deletedAt || guide.gDeleted) return deny("unavailable", req.guideId);

  const [block] = await db()
    .select({ id: blocks.id })
    .from(blocks)
    .where(or(and(eq(blocks.blockerId, seekerId), eq(blocks.blockedId, req.guideId)), and(eq(blocks.blockerId, req.guideId), eq(blocks.blockedId, seekerId))))
    .limit(1);
  if (block) return deny("unavailable", req.guideId);

  const phone = await decryptPhoneForReveal(db(), req.guideId);
  if (!phone) return deny("unavailable", req.guideId);

  await audit(db(), { action: "phone.revealed", actorId: seekerId, targetId: req.guideId, subjectType: "connection_request", subjectId: req.id });
  const a = (guide.data as unknown as GuideProfileData).availability;
  return { ok: true, phone, contactPreference: a.contactPreference, bestTime: a.bestTime };
}
