import "server-only";
import { and, desc, eq, or, sql } from "drizzle-orm";
import { aliasedTable } from "drizzle-orm";
import { audit } from "@/server/audit";
import { db } from "@/server/db/client";
import {
  auditLog, blocks, connectionRequests, guideProfiles, matches, phoneVault, profileDrafts, profileEmbeddings, ratings, reports,
  seekerProfiles, userAliases, userRoles, users,
} from "@/server/db/schema";
import { bumpCounter, GUIDE_POOL_VERSION, RATINGS_VERSION } from "@/server/profile/counters";
import { guideRatingSummary } from "@/server/ratings/service";

/**
 * A copy of the user's own data. It deliberately excludes other people's private data, individual
 * reviews of a Guide, and any phone number (a Guide's number is reported as "on file" with its last 4
 * digits; it is only ever decrypted by the reveal endpoint).
 */
export async function buildExport(userId: string) {
  const [user] = await db().select().from(users).where(eq(users.id, userId));
  if (!user) return null;
  const [role] = await db().select().from(userRoles).where(eq(userRoles.userId, userId));
  const [alias] = await db().select().from(userAliases).where(eq(userAliases.userId, userId));
  const [seeker] = await db().select().from(seekerProfiles).where(eq(seekerProfiles.userId, userId));
  const [guide] = await db().select().from(guideProfiles).where(eq(guideProfiles.userId, userId));
  const [draft] = await db().select().from(profileDrafts).where(eq(profileDrafts.userId, userId));
  const [vault] = await db().select({ last4: phoneVault.last4 }).from(phoneVault).where(eq(phoneVault.guideId, userId));

  const other = aliasedTable(userAliases, "other_alias");
  const requests = await db()
    .select({ seekerId: connectionRequests.seekerId, status: connectionRequests.status, note: connectionRequests.note, createdAt: connectionRequests.createdAt, decidedAt: connectionRequests.decidedAt, otherAlias: other.alias })
    .from(connectionRequests)
    .leftJoin(other, eq(other.userId, sql`case when ${connectionRequests.seekerId} = ${userId} then ${connectionRequests.guideId} else ${connectionRequests.seekerId} end`))
    .where(or(eq(connectionRequests.seekerId, userId), eq(connectionRequests.guideId, userId)))
    .orderBy(desc(connectionRequests.createdAt));

  const guideAlias = aliasedTable(userAliases, "guide_alias");
  const myMatches = await db()
    .select({ rank: matches.rank, score: matches.score, explanation: matches.explanation, createdAt: matches.createdAt, guideAlias: guideAlias.alias })
    .from(matches)
    .leftJoin(guideAlias, eq(guideAlias.userId, matches.guideId))
    .where(eq(matches.seekerId, userId))
    .orderBy(desc(matches.createdAt));

  const ratedGuide = aliasedTable(userAliases, "rated_alias");
  const given = await db()
    .select({ score: ratings.score, review: ratings.review, createdAt: ratings.createdAt, guideAlias: ratedGuide.alias })
    .from(ratings)
    .leftJoin(ratedGuide, eq(ratedGuide.userId, ratings.guideId))
    .where(eq(ratings.seekerId, userId));

  const blockedAlias = aliasedTable(userAliases, "blocked_alias");
  const blocked = await db().select({ alias: blockedAlias.alias, createdAt: blocks.createdAt }).from(blocks).leftJoin(blockedAlias, eq(blockedAlias.userId, blocks.blockedId)).where(eq(blocks.blockerId, userId));
  const myReports = await db().select({ reason: reports.reason, details: reports.details, status: reports.status, createdAt: reports.createdAt }).from(reports).where(eq(reports.reporterId, userId));
  const activity = await db().select({ action: auditLog.action, at: auditLog.at }).from(auditLog).where(eq(auditLog.actorId, userId)).orderBy(desc(auditLog.at)).limit(500);

  return {
    generatedAt: new Date().toISOString(),
    account: { email: user.email, createdAt: user.createdAt, role: role?.role ?? null, alias: alias?.alias ?? null },
    profile: { completed: Boolean((seeker ?? guide)?.profileCompletedAt), answers: (seeker ?? guide)?.data ?? null, unsubmittedDraft: draft?.data ?? null },
    phone: guide ? { onFile: Boolean(vault), endsWith: vault?.last4 ?? null, note: "Your number is stored encrypted and shown only to Seekers you approve." } : undefined,
    matches: myMatches,
    requests: requests.map((r) => ({ direction: r.seekerId === userId ? "sent" : "received", with: r.otherAlias, status: r.status, note: r.seekerId === userId ? r.note : undefined, createdAt: r.createdAt, decidedAt: r.decidedAt })),
    ratingsGiven: given,
    ratingsReceived: guide ? await guideRatingSummary(userId) : undefined,
    blocks: blocked,
    reportsMade: myReports,
    activity,
  };
}

export async function recordExport(userId: string) {
  await audit(db(), { action: "data.exported", actorId: userId, targetId: userId, subjectType: "user", subjectId: userId });
}

/**
 * Permanently deletes an account. The phone vault entry and embeddings are removed explicitly (not only
 * by cascade), then the user row, which cascades profiles, drafts, requests, matches, ratings and
 * sessions. The audit log keeps an anonymous record: its user references become null.
 */
export async function deleteAccount(userId: string): Promise<boolean> {
  const [user] = await db().select().from(users).where(eq(users.id, userId));
  if (!user) return false;
  const [role] = await db().select().from(userRoles).where(eq(userRoles.userId, userId));

  await db().transaction(async (tx) => {
    await audit(tx, { action: "user.deleted", actorId: null, subjectType: "user", subjectId: userId, metadata: { role: role?.role ?? null } });
    await tx.delete(phoneVault).where(eq(phoneVault.guideId, userId));
    await tx.delete(profileEmbeddings).where(eq(profileEmbeddings.userId, userId));
    await tx.delete(profileDrafts).where(eq(profileDrafts.userId, userId));
    await tx.execute(sql`delete from jobs where payload->>'userId' = ${userId} and status in ('queued', 'failed')`);
    await tx.execute(sql`delete from verifications where identifier ilike ${"%" + user.email + "%"}`);
    await tx.execute(sql`delete from dev_outbox where "to" = ${user.email.toLowerCase()}`);
    await tx.delete(users).where(and(eq(users.id, userId)));
    // Anything that cached this user's Guide card or ratings is stale now.
    await bumpCounter(tx, GUIDE_POOL_VERSION);
    await bumpCounter(tx, RATINGS_VERSION);
  });
  return true;
}
