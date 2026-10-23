import "server-only";
import { and, asc, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { MATCHING } from "@/config/matching";
import type { GuideProfileData } from "@/schemas";
import { db } from "@/server/db/client";
import { connectionRequests, guideProfiles, jobs, matchRuns, matches, userAliases } from "@/server/db/schema";
import { kickWorker } from "@/server/jobs/kick";
import { publicGuide, type PublicGuide } from "./public";
import { ratingStats } from "./candidates";

export type MatchCard = {
  matchId: string;
  rank: number;
  alias: string;
  /** 0–100, rounded. */
  score: number;
  explanation: string;
  final: boolean;
  guide: PublicGuide;
  /** Average rating, only once the Guide has enough ratings to show one. */
  rating: { average: number; count: number } | null;
  connection: "none" | "pending" | "approved" | "declined" | "expired";
};

export type RunView = {
  id: string;
  status: "queued" | "matching" | "ranking" | "done" | "failed";
  /** Rough progress for the UI: 0..3. */
  stage: number;
  degraded: boolean;
  llmUsed: boolean;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
  matches: MatchCard[];
};

const STAGE = { queued: 0, matching: 1, ranking: 2, done: 3, failed: 3 } as const;

export async function getRunView(runId: string, seekerId: string): Promise<RunView | null> {
  const [run] = await db().select().from(matchRuns).where(and(eq(matchRuns.id, runId), eq(matchRuns.seekerId, seekerId)));
  if (!run) return null;

  const rows = await db()
    .select({ m: matches, alias: userAliases.alias, data: guideProfiles.data })
    .from(matches)
    .innerJoin(userAliases, eq(userAliases.userId, matches.guideId))
    .innerJoin(guideProfiles, eq(guideProfiles.userId, matches.guideId))
    .where(and(eq(matches.runId, runId), isNotNull(guideProfiles.memberId)))
    .orderBy(asc(matches.rank));

  const guideIds = rows.map((r) => r.m.guideId);
  const stats = await ratingStats(guideIds);
  const conns = guideIds.length
    ? await db().select().from(connectionRequests).where(and(eq(connectionRequests.seekerId, seekerId), inArray(connectionRequests.guideId, guideIds))).orderBy(desc(connectionRequests.createdAt))
    : [];
  const connFor = (guideId: string): MatchCard["connection"] => {
    const latest = conns.find((c) => c.guideId === guideId);
    return (latest?.status as MatchCard["connection"] | undefined) ?? "none";
  };

  // A run that is waiting should never depend on cron: nudge the worker when its job looks idle.
  if (["queued", "matching", "ranking"].includes(run.status) && Date.now() - run.startedAt.getTime() > 10_000) {
    const [job] = await db().select().from(jobs).where(eq(jobs.idempotencyKey, `match_run:${runId}`));
    if (job && (job.status === "queued" || job.status === "failed") && job.runAt.getTime() <= Date.now()) kickWorker();
  }

  return {
    id: run.id,
    status: run.status as RunView["status"],
    stage: STAGE[run.status as keyof typeof STAGE] ?? 0,
    degraded: run.degraded,
    llmUsed: run.llmUsed,
    error: run.status === "failed" ? "We couldn't finish this search. Please try again later." : null,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
    matches: rows.map(({ m, alias, data }) => {
      const r = stats.get(m.guideId);
      return {
        matchId: m.id,
        rank: m.rank,
        alias,
        score: Math.round(m.score * 100),
        explanation: m.explanation,
        final: m.status === "final",
        guide: publicGuide(data as unknown as GuideProfileData),
        rating: r && r.count >= MATCHING.rating.minCountToShow ? { average: Math.round((r.sum / r.count) * 10) / 10, count: r.count } : null,
        connection: connFor(m.guideId),
      };
    }),
  };
}

/** The Seeker's most recent run that is active or finished successfully. */
export async function latestRunId(seekerId: string): Promise<string | null> {
  const [row] = await db()
    .select({ id: matchRuns.id })
    .from(matchRuns)
    .where(and(eq(matchRuns.seekerId, seekerId), inArray(matchRuns.status, ["queued", "matching", "ranking", "done"])))
    .orderBy(desc(matchRuns.startedAt))
    .limit(1);
  return row?.id ?? null;
}
