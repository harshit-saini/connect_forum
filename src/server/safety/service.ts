import "server-only";
import { and, eq, or } from "drizzle-orm";
import { z } from "zod";
import { audit } from "@/server/audit";
import { db } from "@/server/db/client";
import { blocks, connectionRequests, matches, reports } from "@/server/db/schema";
import { REPORT_REASONS } from "@/config/safety";

export const safetyInput = z.object({
  action: z.enum(["report", "block"]),
  reason: z.enum(REPORT_REASONS.map((r) => r.value) as [string, ...string[]]).optional(),
  details: z.string().trim().max(500).optional(),
});

/** What the actor points at. Never a raw user id: it is resolved and ownership-checked server-side. */
export type SafetyTarget = { kind: "match"; id: string } | { kind: "connection"; id: string } | { kind: "user"; id: string };

/** Resolves the other party for a Seeker acting on one of their own matches or connections. */
export async function resolveSeekerTarget(seekerId: string, target: SafetyTarget): Promise<string | null> {
  if (target.kind === "match") {
    const [m] = await db().select({ guideId: matches.guideId }).from(matches).where(and(eq(matches.id, target.id), eq(matches.seekerId, seekerId)));
    return m?.guideId ?? null;
  }
  if (target.kind === "connection") {
    const [c] = await db().select({ guideId: connectionRequests.guideId }).from(connectionRequests).where(and(eq(connectionRequests.id, target.id), eq(connectionRequests.seekerId, seekerId)));
    return c?.guideId ?? null;
  }
  return null;
}

export type SafetyResult = { ok: true } | { ok: false; message: string };

/**
 * Reports or blocks `otherId` on behalf of `actorId`. Both remove the pair from future matching.
 * A block also cancels any pending request between them, and the reveal endpoint refuses a blocked pair.
 */
export async function applySafetyAction(args: { actorId: string; otherId: string; input: z.infer<typeof safetyInput> }): Promise<SafetyResult> {
  const { actorId, otherId, input } = args;
  if (actorId === otherId) return { ok: false, message: "That isn't possible." };

  if (input.action === "report") {
    if (!input.reason) return { ok: false, message: "Please choose a reason." };
    await db().transaction(async (tx) => {
      const [r] = await tx.insert(reports).values({ reporterId: actorId, reportedId: otherId, reason: input.reason!, details: input.details || null }).returning({ id: reports.id });
      await audit(tx, { action: "report.created", actorId, targetId: otherId, subjectType: "report", subjectId: r!.id, metadata: { reason: input.reason } });
    });
    return { ok: true };
  }

  await db().transaction(async (tx) => {
    const [b] = await tx.insert(blocks).values({ blockerId: actorId, blockedId: otherId }).onConflictDoNothing().returning({ id: blocks.id });
    await tx
      .update(connectionRequests)
      .set({ status: "cancelled", decidedAt: new Date(), tokenUsedAt: new Date() })
      .where(and(eq(connectionRequests.status, "pending"), or(and(eq(connectionRequests.seekerId, actorId), eq(connectionRequests.guideId, otherId)), and(eq(connectionRequests.seekerId, otherId), eq(connectionRequests.guideId, actorId)))));
    if (b) await audit(tx, { action: "block.created", actorId, targetId: otherId, subjectType: "block", subjectId: b.id });
  });
  return { ok: true };
}
