import "server-only";
import { and, asc, eq, or } from "drizzle-orm";
import { db } from "@/server/db/client";
import { blocks, connectionRequests, matches, ratings, reports, guideProfiles, seekerProfiles, users } from "@/server/db/schema";
import { audit } from "@/server/audit";
import { guideDisplayName } from "@/lib/display";
import { env } from "@/server/env";
import { sendEmail } from "./index";
import { MatchesReadyEmail } from "./templates/matches-ready";
import { RatingReminderEmail } from "./templates/rating-reminder";
import { GuideDetailsEmail, GuideNotifiedEmail } from "./templates/connection";
import { publicGuide, publicSeeker } from "@/server/matching/public";
import { phoneStatus } from "@/server/profile/phone";
import { decryptPhoneForReveal } from "@/server/vault/reveal";
import type { GuideProfileData, SeekerProfileData } from "@/schemas";

type Payload = { kind: string; userId: string; [k: string]: unknown };

/**
 * An approved connection and its Guide, for the connection e-mails. `reachable` is false when the Guide
 * is suspended or deleted or either side has blocked the other since the connection was made: then
 * nothing about the Guide is sent. `guideEmail` is for an e-mail body only, and only when the Guide's
 * shareEmail is true; it must never reach a job payload, audit metadata or a log.
 */
async function loadConnection(requestId: string) {
  const [r] = await db()
    .select({ id: connectionRequests.id, status: connectionRequests.status, seekerId: connectionRequests.seekerId, guideId: connectionRequests.guideId, note: connectionRequests.note, guideData: guideProfiles.data, guideEmail: users.email, suspendedAt: users.suspendedAt, deletedAt: users.deletedAt, gDeleted: guideProfiles.deletedAt })
    .from(connectionRequests)
    .innerJoin(guideProfiles, eq(guideProfiles.userId, connectionRequests.guideId))
    .innerJoin(users, eq(users.id, connectionRequests.guideId))
    .where(eq(connectionRequests.id, requestId))
    .limit(1);
  if (!r || r.status !== "approved") return null;
  const [block] = await db()
    .select({ id: blocks.id })
    .from(blocks)
    .where(or(and(eq(blocks.blockerId, r.seekerId), eq(blocks.blockedId, r.guideId)), and(eq(blocks.blockerId, r.guideId), eq(blocks.blockedId, r.seekerId))))
    .limit(1);
  // A report filed after connecting also stops the send (createRequest refuses a reported pair too).
  const [report] = await db()
    .select({ id: reports.id })
    .from(reports)
    .where(or(and(eq(reports.reporterId, r.seekerId), eq(reports.reportedId, r.guideId)), and(eq(reports.reporterId, r.guideId), eq(reports.reportedId, r.seekerId))))
    .limit(1);
  const reachable = !r.suspendedAt && !r.deletedAt && !r.gDeleted && !block && !report;
  return { id: r.id, seekerId: r.seekerId, guideId: r.guideId, note: r.note, guideData: r.guideData as unknown as GuideProfileData, guideEmail: r.guideEmail, reachable };
}

/**
 * `send_email` job: payloads carry ids only, never addresses or phone numbers. The recipient and content are
 * resolved when the job runs. Later milestones add their own kinds here.
 */
export async function sendEmailJob(payload: Payload): Promise<void> {
  const [user] = await db().select().from(users).where(eq(users.id, payload.userId)).limit(1);
  if (!user || user.deletedAt || user.suspendedAt) return;

  switch (payload.kind) {
    case "matches_ready": {
      const rows = await db()
        .select({ data: guideProfiles.data, why: matches.explanation })
        .from(matches)
        .innerJoin(guideProfiles, eq(guideProfiles.userId, matches.guideId))
        .where(eq(matches.runId, String(payload.runId)))
        .orderBy(asc(matches.rank));
      if (rows.length === 0) return;
      await sendEmail({
        to: user.email,
        subject: "Your top Guide matches are ready",
        kind: "matches-ready",
        react: MatchesReadyEmail({ matches: rows.map((r) => ({ name: guideDisplayName(r.data as unknown as GuideProfileData), why: r.why })), link: `${env().APP_URL}/seeker` }),
      });
      return;
    }
    case "guide_details": {
      // To the Seeker: the Guide's public details and, only if they gave one, their number. The Guide's e-mail
      // address is included only if they opted in (shareEmail) in their profile as it stands right now.
      const c = await loadConnection(String(payload.requestId));
      if (!c || c.seekerId !== user.id || !c.reachable) return;
      const pub = publicGuide(c.guideData);
      // Decrypted here, at send time. It goes into the e-mail only; the job row holds ids.
      const phone = await decryptPhoneForReveal(db(), c.guideId);
      // Legacy profiles have no shareEmail: only an explicit true counts.
      const guideEmail = c.guideData.shareEmail === true ? c.guideEmail : null;
      await sendEmail({
        to: user.email,
        subject: "Your Guide's details",
        kind: "guide-details",
        react: GuideDetailsEmail({ title: pub.title, years: pub.years, categories: pub.categories, about: pub.about, phone, guideEmail, link: `${env().APP_URL}/seeker/connections/${c.id}` }),
        // A retry after a lost response must not send the number twice.
        idempotencyKey: `guide_details:${c.id}`,
      });
      // Ids and whether a number was included; never the number or the address.
      await audit(db(), { action: "phone.emailed", actorId: c.seekerId, targetId: c.guideId, subjectType: "connection_request", subjectId: c.id, metadata: { included: phone !== null } });
      // Actor is the person whose address was shared, target the person it was sent to. Ids and direction only.
      if (guideEmail) await audit(db(), { action: "email.shared", actorId: c.guideId, targetId: c.seekerId, subjectType: "connection_request", subjectId: c.id, metadata: { direction: "guide_to_seeker" } });
      return;
    }
    case "guide_notified": {
      // To the Guide: a Seeker has their details, and here is the Seeker's e-mail address (they agreed to
      // share it in the connect dialog). No name or phone: Seekers have neither on file.
      const c = await loadConnection(String(payload.requestId));
      if (!c || c.guideId !== user.id || !c.reachable) return;
      const [seeker] = await db().select().from(seekerProfiles).where(eq(seekerProfiles.userId, c.seekerId)).limit(1);
      if (!seeker) return;
      const [seekerUser] = await db().select({ email: users.email, suspendedAt: users.suspendedAt, deletedAt: users.deletedAt }).from(users).where(eq(users.id, c.seekerId)).limit(1);
      if (!seekerUser || seekerUser.suspendedAt || seekerUser.deletedAt) return;
      const pub = publicSeeker(seeker.data as unknown as SeekerProfileData);
      const { has } = await phoneStatus(db(), c.guideId);
      await sendEmail({
        to: user.email,
        subject: "A Seeker has been given your details",
        kind: "guide-notified",
        react: GuideNotifiedEmail({ category: pub.category, question: pub.question, note: c.note, hasPhone: has, seekerEmail: payload.shares === 2 ? seekerUser.email : null }),
        idempotencyKey: `guide_notified:${c.id}`,
      });
      if (payload.shares === 2) await audit(db(), { action: "email.shared", actorId: c.seekerId, targetId: c.guideId, subjectType: "connection_request", subjectId: c.id, metadata: { direction: "seeker_to_guide" } });
      return;
    }
    case "rating_reminder": {
      const [r] = await db().select({ id: connectionRequests.id, status: connectionRequests.status, data: guideProfiles.data }).from(connectionRequests).innerJoin(guideProfiles, eq(guideProfiles.userId, connectionRequests.guideId)).where(eq(connectionRequests.id, String(payload.requestId)));
      if (!r || r.status !== "approved") return;
      const [done] = await db().select({ id: ratings.id }).from(ratings).where(eq(ratings.connectionRequestId, r.id)).limit(1);
      if (done) return; // already rated: no nag
      await sendEmail({ to: user.email, subject: "How was your Guide?", kind: "rating-reminder", react: RatingReminderEmail({ guideName: guideDisplayName(r.data as unknown as GuideProfileData), link: `${env().APP_URL}/seeker/rate/${r.id}` }) });
      return;
    }
    // Kinds from the retired approval flow may still be queued in an existing database: drop them quietly.
    case "connection_request":
    case "request_approved":
    case "request_declined":
    case "request_expired":
      return;
    default:
      throw new Error(`Unknown email kind: ${payload.kind}`);
  }
}
