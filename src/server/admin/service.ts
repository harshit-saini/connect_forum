import "server-only";
import { aliasedTable, and, count, desc, eq, ilike, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import { audit } from "@/server/audit";
import { db } from "@/server/db/client";
import { auditLog, faqEvents, guideProfiles, ratings, reports, seekerProfiles, sessions, userRoles, users } from "@/server/db/schema";
import { sendEmail } from "@/server/email";
import { GuideInviteEmail } from "@/server/email/templates/guide-invite";
import { env } from "@/server/env";
import { bumpCounter, GUIDE_POOL_VERSION } from "@/server/profile/counters";

export const PAGE_SIZE = 25;

const page = (n: number) => ({ limit: PAGE_SIZE, offset: Math.max(0, n - 1) * PAGE_SIZE });

export async function overview() {
  const [[u], [g], [s], [r], [sus]] = await Promise.all([
    db().select({ n: count() }).from(users).where(isNull(users.deletedAt)),
    db().select({ n: count() }).from(guideProfiles).where(isNotNull(guideProfiles.profileCompletedAt)),
    db().select({ n: count() }).from(seekerProfiles).where(isNotNull(seekerProfiles.profileCompletedAt)),
    db().select({ n: count() }).from(reports).where(eq(reports.status, "open")),
    db().select({ n: count() }).from(users).where(isNotNull(users.suspendedAt)),
  ]);
  return { users: u!.n, guides: g!.n, seekers: s!.n, openReports: r!.n, suspended: sus!.n };
}

export type AdminUserRow = { id: string; email: string; memberId: string | null; role: string | null; suspendedAt: Date | null; createdAt: Date; profileCompleted: boolean };

export async function listUsers(args: { q?: string; status?: "all" | "suspended"; page: number }): Promise<{ rows: AdminUserRow[]; total: number }> {
  const filters: SQL[] = [isNull(users.deletedAt)];
  if (args.q) filters.push(or(ilike(users.email, `%${args.q}%`), ilike(seekerProfiles.memberId, `%${args.q}%`), ilike(guideProfiles.memberId, `%${args.q}%`))!);
  if (args.status === "suspended") filters.push(isNotNull(users.suspendedAt));
  const where = and(...filters);

  const base = db().select({ id: users.id }).from(users)
    .leftJoin(seekerProfiles, eq(seekerProfiles.userId, users.id))
    .leftJoin(guideProfiles, eq(guideProfiles.userId, users.id))
    .where(where);
  const [{ n }] = (await db().select({ n: count() }).from(base.as("t"))) as [{ n: number }];
  const rows = await db()
    .select({
      id: users.id, email: users.email, role: userRoles.role, suspendedAt: users.suspendedAt, createdAt: users.createdAt,
      seekerMember: seekerProfiles.memberId, guideMember: guideProfiles.memberId, seekerDone: seekerProfiles.profileCompletedAt, guideDone: guideProfiles.profileCompletedAt,
    })
    .from(users)
    .leftJoin(userRoles, eq(userRoles.userId, users.id))
    .leftJoin(seekerProfiles, eq(seekerProfiles.userId, users.id))
    .leftJoin(guideProfiles, eq(guideProfiles.userId, users.id))
    .where(where)
    .orderBy(desc(users.createdAt))
    .limit(page(args.page).limit)
    .offset(page(args.page).offset);
  return { total: n, rows: rows.map((r) => ({ id: r.id, email: r.email, memberId: r.seekerMember ?? r.guideMember ?? null, role: r.role, suspendedAt: r.suspendedAt, createdAt: r.createdAt, profileCompleted: Boolean(r.seekerDone || r.guideDone) })) };
}

export type AdminResult = { ok: true } | { ok: false; message: string };

/**
 * Suspends a user: excluded from matching, their number can no longer be revealed, requests to and from
 * them stop, and every session is revoked so they are signed out immediately.
 */
export async function suspendUser(args: { adminId: string; userId: string; reason?: string }): Promise<AdminResult> {
  const { adminId, userId } = args;
  if (adminId === userId) return { ok: false, message: "You can't suspend yourself." };
  const [target] = await db().select().from(users).where(eq(users.id, userId));
  if (!target || target.deletedAt) return { ok: false, message: "User not found." };
  if (target.suspendedAt) return { ok: true };

  await db().transaction(async (tx) => {
    await tx.update(users).set({ suspendedAt: new Date(), updatedAt: new Date() }).where(eq(users.id, userId));
    await tx.delete(sessions).where(eq(sessions.userId, userId));
    await bumpCounter(tx, GUIDE_POOL_VERSION); // cached match results may include this Guide
    await audit(tx, { action: "user.suspended", actorId: adminId, targetId: userId, subjectType: "user", subjectId: userId, metadata: { reason: args.reason?.slice(0, 200) } });
  });
  return { ok: true };
}

export async function unsuspendUser(args: { adminId: string; userId: string }): Promise<AdminResult> {
  const [target] = await db().select().from(users).where(eq(users.id, args.userId));
  if (!target || target.deletedAt) return { ok: false, message: "User not found." };
  if (!target.suspendedAt) return { ok: true };
  await db().transaction(async (tx) => {
    await tx.update(users).set({ suspendedAt: null, updatedAt: new Date() }).where(eq(users.id, args.userId));
    await bumpCounter(tx, GUIDE_POOL_VERSION);
    await audit(tx, { action: "user.unsuspended", actorId: args.adminId, targetId: args.userId, subjectType: "user", subjectId: args.userId });
  });
  return { ok: true };
}

export type ReportRow = { id: string; reason: string; details: string | null; status: string; createdAt: Date; reporterEmail: string | null; reportedEmail: string | null; reportedId: string; reportedSuspended: boolean };

export async function listReports(status: "open" | "all", pageNo: number): Promise<{ rows: ReportRow[]; total: number }> {
  const reporter = aliasedTable(users, "reporter_user");
  const reported = aliasedTable(users, "reported_user");
  const where = status === "open" ? eq(reports.status, "open") : undefined;
  const [{ n }] = (await db().select({ n: count() }).from(reports).where(where)) as [{ n: number }];
  const rows = await db()
    .select({ id: reports.id, reason: reports.reason, details: reports.details, status: reports.status, createdAt: reports.createdAt, reporterEmail: reporter.email, reportedEmail: reported.email, reportedId: reports.reportedId, suspendedAt: reported.suspendedAt })
    .from(reports)
    .leftJoin(reporter, eq(reporter.id, reports.reporterId))
    .leftJoin(reported, eq(reported.id, reports.reportedId))
    .where(where)
    .orderBy(desc(reports.createdAt))
    .limit(page(pageNo).limit)
    .offset(page(pageNo).offset);
  return { total: n, rows: rows.map((r) => ({ id: r.id, reason: r.reason, details: r.details, status: r.status, createdAt: r.createdAt, reporterEmail: r.reporterEmail, reportedEmail: r.reportedEmail, reportedId: r.reportedId, reportedSuspended: Boolean(r.suspendedAt) })) };
}

export async function reviewReport(adminId: string, reportId: string, outcome: "reviewed" | "dismissed"): Promise<AdminResult> {
  const updated = await db().update(reports).set({ status: outcome, reviewedAt: new Date() }).where(eq(reports.id, reportId)).returning({ id: reports.id, reportedId: reports.reportedId });
  if (!updated[0]) return { ok: false, message: "Report not found." };
  await audit(db(), { action: "report.reviewed", actorId: adminId, targetId: updated[0].reportedId, subjectType: "report", subjectId: reportId, metadata: { outcome } });
  return { ok: true };
}

export type AdminRatingRow = { id: string; score: number; review: string | null; createdAt: Date; guideEmail: string | null; seekerEmail: string | null };

/** Individual ratings and reviews: visible to admins only (Guides see aggregates; the matcher sees scores). */
export async function listRatings(pageNo: number): Promise<{ rows: AdminRatingRow[]; total: number }> {
  const guideUser = aliasedTable(users, "g_user");
  const seekerUser = aliasedTable(users, "s_user");
  const [{ n }] = (await db().select({ n: count() }).from(ratings)) as [{ n: number }];
  const rows = await db()
    .select({ id: ratings.id, score: ratings.score, review: ratings.review, createdAt: ratings.createdAt, guideEmail: guideUser.email, seekerEmail: seekerUser.email })
    .from(ratings)
    .leftJoin(guideUser, eq(guideUser.id, ratings.guideId))
    .leftJoin(seekerUser, eq(seekerUser.id, ratings.seekerId))
    .orderBy(desc(ratings.createdAt))
    .limit(page(pageNo).limit)
    .offset(page(pageNo).offset);
  return { total: n, rows };
}

export type AuditRow = { id: string; at: Date; action: string; actorEmail: string | null; targetEmail: string | null; subjectType: string | null; metadata: Record<string, unknown> };

export async function listAudit(args: { action?: string; page: number }): Promise<{ rows: AuditRow[]; total: number; actions: string[] }> {
  const actor = aliasedTable(users, "a_user");
  const target = aliasedTable(users, "t_user");
  const where = args.action ? eq(auditLog.action, args.action) : undefined;
  const [{ n }] = (await db().select({ n: count() }).from(auditLog).where(where)) as [{ n: number }];
  const rows = await db()
    .select({ id: auditLog.id, at: auditLog.at, action: auditLog.action, actorEmail: actor.email, targetEmail: target.email, subjectType: auditLog.subjectType, metadata: auditLog.metadata })
    .from(auditLog)
    .leftJoin(actor, eq(actor.id, auditLog.actorId))
    .leftJoin(target, eq(target.id, auditLog.targetId))
    .where(where)
    .orderBy(desc(auditLog.at))
    .limit(page(args.page).limit)
    .offset(page(args.page).offset);
  const distinct = await db().execute(sql`select distinct action from audit_log order by action`);
  return { total: n, rows, actions: (distinct as unknown as { rows: { action: string }[] }).rows.map((r) => r.action) };
}


const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MAX_INVITES_PER_SUBMISSION = 25;

/** Splits a pasted list (commas, semicolons, spaces or new lines) into unique, valid, lower-cased addresses. */
export function parseInviteEmails(raw: string): { valid: string[]; invalid: string[] } {
  const seen = new Set<string>();
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const part of raw.split(/[\s,;]+/).map((p) => p.trim().toLowerCase()).filter(Boolean)) {
    if (seen.has(part)) continue;
    seen.add(part);
    (EMAIL.test(part) && part.length <= 254 ? valid : invalid).push(part);
  }
  return { valid, invalid };
}

export type InviteResult = { ok: true; sent: number; failed: number; invalid: string[] } | { ok: false; message: string };

/** Emails each address the Guide registration link. Addresses are not stored; the audit entry holds counts only. */
export async function inviteGuides(adminId: string, raw: string): Promise<InviteResult> {
  const { valid, invalid } = parseInviteEmails(raw);
  if (valid.length === 0) return { ok: false, message: invalid.length ? "None of those look like email addresses." : "Enter at least one email address." };
  if (valid.length > MAX_INVITES_PER_SUBMISSION) return { ok: false, message: `Send at most ${MAX_INVITES_PER_SUBMISSION} invitations at a time.` };

  const link = `${env().APP_URL}/join/guide`;
  let sent = 0;
  let failed = 0;
  for (const to of valid) {
    try {
      await sendEmail({ to, subject: "You're invited to join Connect as a Guide", kind: "guide-invite", react: GuideInviteEmail({ link }) });
      sent++;
    } catch {
      failed++;
    }
  }
  await audit(db(), { action: "guide.invited", actorId: adminId, metadata: { sent, failed } });
  return { ok: true, sent, failed, invalid };
}

/** How the FAQs performed: Seekers who said they answered the question versus those who still needed a Guide. */
export async function faqStats() {
  const rows = await db()
    .select({ category: faqEvents.category, outcome: faqEvents.outcome, n: count() })
    .from(faqEvents)
    .groupBy(faqEvents.category, faqEvents.outcome);
  const byCategory = new Map<string, { resolved: number; escalated: number }>();
  for (const r of rows) {
    const entry = byCategory.get(r.category) ?? { resolved: 0, escalated: 0 };
    if (r.outcome === "resolved") entry.resolved = r.n;
    else entry.escalated = r.n;
    byCategory.set(r.category, entry);
  }
  return byCategory;
}
