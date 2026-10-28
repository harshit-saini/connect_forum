import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { closeLegacyPending } from "@/server/connections/service";
import { db } from "@/server/db/client";
import { jobs } from "@/server/db/schema";
import { queue } from "@/server/jobs";
import { failRun } from "@/server/matching/pipeline";
import { STALE_AFTER_MS, processJobs } from "@/server/jobs/worker";
import { log } from "@/server/logging/logger";

export type HousekeepingReport = { requeued: number; failedRuns: number; closedLegacyRequests: number; jobsProcessed: number; purged: Record<string, number> };

async function purge(table: string, where: ReturnType<typeof sql>): Promise<number> {
  const res = await db().execute(sql`delete from ${sql.raw(table)} where ${where}`);
  return (res as unknown as { rowCount?: number }).rowCount ?? 0;
}

/**
 * The daily safety net (and what delivers due rating reminders when nothing else has run a worker).
 * Every step is idempotent, so running it late, twice, or concurrently is harmless.
 */
export async function runHousekeeping(): Promise<HousekeepingReport> {
  // 1. Jobs that stopped heartbeating go back to the queue (or die after their last attempt).
  const requeued = await queue().requeueStale(STALE_AFTER_MS);

  // 2. Runs whose job is dead must not stay "in progress" for the user.
  const dead = await db().select({ payload: jobs.payload }).from(jobs).where(and(eq(jobs.type, "match_run"), eq(jobs.status, "dead")));
  for (const j of dead) await failRun(String(j.payload.runId), "The search could not be completed");

  // 3. Close requests the old approval flow left pending: nobody can answer them any more.
  const closedLegacyRequests = await closeLegacyPending();

  // 4. Run whatever is due: rating reminders, emails, embeddings that missed their kick.
  const jobsProcessed = await processJobs({ maxMs: 40_000, maxJobs: 100 });

  // 5. Tidy up.
  const purged = {
    rateLimits: await purge("rate_limits", sql`window_start < now() - interval '2 days'`),
    authRateLimits: await purge("auth_rate_limits", sql`last_request < ${Date.now() - 2 * 86_400_000}`),
    doneJobs: await purge("jobs", sql`status = 'done' and finished_at < now() - interval '30 days'`),
    verifications: await purge("verifications", sql`expires_at < now() - interval '1 day'`),
    sessions: await purge("sessions", sql`expires_at < now()`),
    devOutbox: await purge("dev_outbox", sql`created_at < now() - interval '7 days'`),
  };

  const report = { requeued, failedRuns: dead.length, closedLegacyRequests, jobsProcessed, purged };
  log.info("housekeeping.done", report);
  return report;
}
