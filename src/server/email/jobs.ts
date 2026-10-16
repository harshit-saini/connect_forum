import "server-only";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { connectionRequests, jobs, matches, ratings, seekerProfiles, userAliases, users } from "@/server/db/schema";
import { env } from "@/server/env";
import { sendEmail } from "./index";
import { MatchesReadyEmail } from "./templates/matches-ready";
import { RatingReminderEmail } from "./templates/rating-reminder";
import { ConnectionRequestEmail, RequestApprovedEmail, RequestDeclinedEmail, RequestExpiredEmail } from "./templates/connection";
import { publicSeeker } from "@/server/matching/public";
import { REQUEST_TTL_DAYS } from "@/server/connections/service";
import { openFromString } from "@/server/vault";
import type { SeekerProfileData } from "@/schemas";

type Payload = { kind: string; userId: string; [k: string]: unknown };

/**
 * `send_email` job: payloads carry ids only, never addresses or tokens. The recipient and content are
 * resolved when the job runs. Later milestones add their own kinds here.
 */
export async function sendEmailJob(payload: Payload, jobId?: string): Promise<void> {
  const [user] = await db().select().from(users).where(eq(users.id, payload.userId)).limit(1);
  if (!user || user.deletedAt || user.suspendedAt) return;

  switch (payload.kind) {
    case "matches_ready": {
      const rows = await db()
        .select({ alias: userAliases.alias, why: matches.explanation })
        .from(matches)
        .innerJoin(userAliases, eq(userAliases.userId, matches.guideId))
        .where(eq(matches.runId, String(payload.runId)))
        .orderBy(asc(matches.rank));
      if (rows.length === 0) return;
      await sendEmail({
        to: user.email,
        subject: "Your top Guide matches are ready",
        kind: "matches-ready",
        react: MatchesReadyEmail({ matches: rows, link: `${env().APP_URL}/seeker` }),
      });
      return;
    }
    case "connection_request": {
      const requestId = String(payload.requestId);
      const [r] = await db().select().from(connectionRequests).where(eq(connectionRequests.id, requestId)).limit(1);
      if (!r || r.status !== "pending" || r.expiresAt.getTime() < Date.now()) return; // nothing left to review
      const [seeker] = await db().select().from(seekerProfiles).where(eq(seekerProfiles.userId, r.seekerId)).limit(1);
      const [alias] = await db().select().from(userAliases).where(eq(userAliases.userId, r.seekerId)).limit(1);
      if (!seeker || !alias) return;
      const pub = publicSeeker(seeker.data as unknown as SeekerProfileData);
      const token = openFromString(String(payload.sealedToken), requestId);
      await sendEmail({
        to: user.email,
        subject: "A Seeker would like your guidance",
        kind: "connection-request",
        react: ConnectionRequestEmail({
          seekerAlias: alias.alias,
          stage: pub.stage,
          goal: pub.goal,
          target: `${pub.targetRoles.join(", ")} (${pub.targetIndustries.join(", ")})`,
          help: pub.helpNeeded.slice(0, 3),
          link: `${env().APP_URL}/review/${token}`,
          days: REQUEST_TTL_DAYS,
        }),
      });
      // The e-mail is out: drop the sealed token from the job row.
      if (jobId) await db().update(jobs).set({ payload: sql`jsonb_build_object('kind', ${"connection_request"}::text, 'userId', ${payload.userId}::text, 'requestId', ${requestId}::text, 'sent', true)` }).where(eq(jobs.id, jobId));
      return;
    }
    case "request_approved": {
      const [r] = await db().select({ id: connectionRequests.id, status: connectionRequests.status, alias: userAliases.alias }).from(connectionRequests).innerJoin(userAliases, eq(userAliases.userId, connectionRequests.guideId)).where(eq(connectionRequests.id, String(payload.requestId)));
      if (!r || r.status !== "approved") return;
      await sendEmail({ to: user.email, subject: "Your request was approved", kind: "request-approved", react: RequestApprovedEmail({ guideAlias: r.alias, link: `${env().APP_URL}/seeker/connections/${r.id}` }) });
      return;
    }
    case "rating_reminder": {
      const [r] = await db().select({ id: connectionRequests.id, status: connectionRequests.status, alias: userAliases.alias }).from(connectionRequests).innerJoin(userAliases, eq(userAliases.userId, connectionRequests.guideId)).where(eq(connectionRequests.id, String(payload.requestId)));
      if (!r || r.status !== "approved") return;
      const [done] = await db().select({ id: ratings.id }).from(ratings).where(eq(ratings.connectionRequestId, r.id)).limit(1);
      if (done) return; // already rated: no nag
      await sendEmail({ to: user.email, subject: "How was your Guide?", kind: "rating-reminder", react: RatingReminderEmail({ guideAlias: r.alias, link: `${env().APP_URL}/seeker/rate/${r.id}` }) });
      return;
    }
    case "request_declined":
      await sendEmail({ to: user.email, subject: "An update on your request", kind: "request-declined", react: RequestDeclinedEmail({ link: `${env().APP_URL}/seeker` }) });
      return;
    case "request_expired":
      await sendEmail({ to: user.email, subject: "Your request wasn't answered in time", kind: "request-expired", react: RequestExpiredEmail({ link: `${env().APP_URL}/seeker` }) });
      return;
    default:
      throw new Error(`Unknown email kind: ${payload.kind}`);
  }
}
