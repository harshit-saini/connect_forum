import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { matches, userAliases, users } from "@/server/db/schema";
import { env } from "@/server/env";
import { sendEmail } from "./index";
import { MatchesReadyEmail } from "./templates/matches-ready";

type Payload = { kind: string; userId: string; [k: string]: unknown };

/**
 * `send_email` job: payloads carry ids only, never addresses or tokens. The recipient and content are
 * resolved when the job runs. Later milestones add their own kinds here.
 */
export async function sendEmailJob(payload: Payload): Promise<void> {
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
    default:
      throw new Error(`Unknown email kind: ${payload.kind}`);
  }
}
