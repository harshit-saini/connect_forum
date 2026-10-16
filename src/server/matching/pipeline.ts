import "server-only";
import { createHash } from "node:crypto";
import { and, desc, eq, gte, inArray, ne, notInArray, sql } from "drizzle-orm";
import { MATCHING } from "@/config/matching";
import type { GuideProfileData } from "@/schemas";
import { db } from "@/server/db/client";
import { counters, matchRuns, matches } from "@/server/db/schema";
import { env } from "@/server/env";
import { queue } from "@/server/jobs";
import { log } from "@/server/logging/logger";
import { GUIDE_POOL_VERSION, RATINGS_VERSION } from "@/server/profile/counters";
import { findCandidates, loadSeekerContext, ratingStats, type Candidate, type SeekerContext } from "./candidates";
import { publicGuide, publicSeeker, type PublicGuide } from "./public";
import { rerank } from "./rerank";
import { blend, normalizeRange, ratingScore01, structuredScore, bayesianRating, type StructuredParts } from "./scoring";


const ACTIVE = ["queued", "matching", "ranking"] as const;

async function counter(name: string): Promise<number> {
  const [row] = await db().select().from(counters).where(eq(counters.name, name));
  return row?.value ?? 0;
}

export function computeInputHash(parts: { profileVersion: number; poolVersion: number; ratingsVersion: number; embeddings: boolean; connectionStamp: number }): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

/** Changes whenever one of this Seeker's requests is created or answered: those change who is eligible. */
async function connectionStamp(seekerId: string): Promise<number> {
  const res = await db().execute(sql`select coalesce(max(extract(epoch from greatest(created_at, coalesce(decided_at, created_at)))), 0)::float8 as stamp from connection_requests where seeker_id = ${seekerId}`);
  return Number((res as unknown as { rows: { stamp: number }[] }).rows[0]!.stamp);
}

async function currentInputHash(seekerId: string, profileVersion: number) {
  return computeInputHash({
    connectionStamp: await connectionStamp(seekerId),
    profileVersion,
    poolVersion: await counter(GUIDE_POOL_VERSION),
    ratingsVersion: await counter(RATINGS_VERSION),
    embeddings: env().ENABLE_EMBEDDINGS,
  });
}

export type StartResult =
  | { kind: "started"; runId: string; degraded: boolean }
  | { kind: "active"; runId: string }
  | { kind: "cached"; runId: string; message: string }
  | { kind: "blocked"; reason: "cooldown" | "daily_cap"; retryAfterSeconds: number; message: string };

function uniqueViolation(err: unknown) {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
}

/**
 * Creates a run for a Seeker, or explains why not. Order: an active run is returned as is; an unchanged
 * input hash returns the cached result (no LLM call); then the cooldown, the daily cap and the global
 * LLM budget apply. When the LLM budget is spent the run still happens, ranked without the LLM.
 */
export async function startRun(seekerId: string, profileVersion: number): Promise<StartResult> {
  const e = env();
  const [active] = await db().select().from(matchRuns).where(and(eq(matchRuns.seekerId, seekerId), inArray(matchRuns.status, [...ACTIVE]))).limit(1);
  if (active) return { kind: "active", runId: active.id };

  const hash = await currentInputHash(seekerId, profileVersion);
  const [lastDone] = await db().select().from(matchRuns).where(and(eq(matchRuns.seekerId, seekerId), eq(matchRuns.status, "done"))).orderBy(desc(matchRuns.startedAt)).limit(1);
  if (lastDone && lastDone.inputHash === hash) {
    return { kind: "cached", runId: lastDone.id, message: "No new Guides since your last search. Here are your latest matches." };
  }

  const [last] = await db().select().from(matchRuns).where(and(eq(matchRuns.seekerId, seekerId), ne(matchRuns.status, "failed"))).orderBy(desc(matchRuns.startedAt)).limit(1);
  if (last) {
    const elapsed = (Date.now() - last.startedAt.getTime()) / 1000;
    const wait = e.MATCH_COOLDOWN_MINUTES * 60 - elapsed;
    if (wait > 0) return { kind: "blocked", reason: "cooldown", retryAfterSeconds: Math.ceil(wait), message: `Please wait ${Math.ceil(wait / 60)} more minute(s) before searching again.` };
  }

  const dayAgo = new Date(Date.now() - 24 * 3600_000);
  const [{ n: today }] = (await db().select({ n: sql<number>`count(*)::int` }).from(matchRuns).where(and(eq(matchRuns.seekerId, seekerId), ne(matchRuns.status, "failed"), gte(matchRuns.startedAt, dayAgo)))) as [{ n: number }];
  if (today >= e.MATCH_MAX_RUNS_PER_DAY) {
    return { kind: "blocked", reason: "daily_cap", retryAfterSeconds: 3600, message: `You've reached today's limit of ${e.MATCH_MAX_RUNS_PER_DAY} searches. Please try again tomorrow.` };
  }

  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const [{ n: llmToday }] = (await db().select({ n: sql<number>`count(*)::int` }).from(matchRuns).where(and(ne(matchRuns.status, "failed"), eq(matchRuns.degraded, false), gte(matchRuns.startedAt, startOfDay)))) as [{ n: number }];
  const degraded = llmToday >= e.MAX_LLM_RUNS_PER_DAY;

  try {
    const runId = await db().transaction(async (tx) => {
      const [run] = await tx.insert(matchRuns).values({ seekerId, inputHash: hash, degraded }).returning({ id: matchRuns.id });
      await queue().enqueue(tx, "match_run", { runId: run!.id }, { idempotencyKey: `match_run:${run!.id}` });
      return run!.id;
    });
    return { kind: "started", runId, degraded };
  } catch (err) {
    if (!uniqueViolation(err)) throw err;
    const [raced] = await db().select().from(matchRuns).where(and(eq(matchRuns.seekerId, seekerId), inArray(matchRuns.status, [...ACTIVE]))).limit(1);
    if (raced) return { kind: "active", runId: raced.id };
    throw err;
  }
}

type Scored = {
  c: Candidate;
  structured: number;
  parts: StructuredParts;
  vector: number;
  preliminary: number;
  pub: PublicGuide;
};

/** One-sentence explanation from the Guide's public fields only, used when the LLM is unavailable. */
export function genericExplanation(parts: StructuredParts, g: PublicGuide, seekerNeeds: string[]): string {
  const bits: string[] = [];
  const shared = g.help.map((h) => h.type).filter((h) => seekerNeeds.includes(h));
  if (parts.helpOverlap >= 0.4 && shared.length) bits.push(`can help with ${shared.slice(0, 2).join(" and ").toLowerCase()}`);
  if (parts.functionIndustry >= 0.5) bits.push(`works in ${g.functions[0]?.toLowerCase() ?? "your target area"}${g.industries[0] ? ` (${g.industries[0]})` : ""}`);
  if (parts.transition >= 1) bits.push("has made a similar career transition");
  if (parts.stageFit >= 1) bits.push("often helps people at your career stage");
  if (bits.length === 0) bits.push(`brings ${g.years} years of experience as ${g.title}`);
  const sentence = `This Guide ${bits.slice(0, 3).join(", ")}.`;
  return sentence.replace(/, ([^,]*)\.$/, ", and $1.").replace(/^(.{1,200}).*$/, "$1");
}

/**
 * Writes a run's matches. Existing rows for the same Guide are updated in place, so a match id the
 * Seeker already sees (and may be clicking) stays valid when preliminary results become final.
 */
async function replaceMatches(
  runId: string,
  seekerId: string,
  items: Array<{ guideId: string; score: number; breakdown: Record<string, unknown>; explanation: string }>,
  status: "preliminary" | "final",
) {
  await db().transaction(async (tx) => {
    if (items.length === 0) {
      await tx.delete(matches).where(eq(matches.runId, runId));
      return;
    }
    await tx
      .delete(matches)
      .where(and(eq(matches.runId, runId), notInArray(matches.guideId, items.map((m) => m.guideId))));
    await tx
      .insert(matches)
      .values(items.map((m, i) => ({ runId, seekerId, guideId: m.guideId, rank: i + 1, score: m.score, scoreBreakdown: m.breakdown, explanation: m.explanation, status })))
      .onConflictDoUpdate({
        target: [matches.runId, matches.guideId],
        set: { rank: sql`excluded.rank`, score: sql`excluded.score`, scoreBreakdown: sql`excluded.score_breakdown`, explanation: sql`excluded.explanation`, status: sql`excluded.status` },
      });
  });
}

async function setStatus(runId: string, status: string, extra: Partial<typeof matchRuns.$inferInsert> = {}) {
  await db().update(matchRuns).set({ status, ...extra }).where(eq(matchRuns.id, runId));
}

/** Runs both stages for a match_run job. Idempotent: re-running replaces the run's matches. */
export async function executeRun(runId: string): Promise<void> {
  const e = env();
  const [run] = await db().select().from(matchRuns).where(eq(matchRuns.id, runId));
  if (!run || run.status === "done" || run.status === "failed") return;

  try {
    await setStatus(runId, "matching");
    const ctx: SeekerContext | null = await loadSeekerContext(run.seekerId, e.ENABLE_EMBEDDINGS);
    if (!ctx) throw new Error("Seeker profile is not available");
    const useVectors = e.ENABLE_EMBEDDINGS && ctx.embedding !== null;
    const cands = await findCandidates(ctx);

    // Stage 1: structured score + vector similarity.
    const sims = cands.map((c) => c.similarity ?? 0);
    const vecNorm = useVectors && cands.length ? normalizeRange(sims) : cands.map(() => 0);
    const scored: Scored[] = cands.map((c, i) => {
      const ss = structuredScore(ctx.facts, c.facts);
      const preliminary = useVectors ? blend(MATCHING.preliminary, { structured: ss.score, vector: vecNorm[i]! }) : ss.score;
      return { c, structured: ss.score, parts: ss.parts, vector: vecNorm[i]!, preliminary, pub: publicGuide(c.data as GuideProfileData) };
    });
    scored.sort((a, b) => b.preliminary - a.preliminary);
    const pool = scored.slice(0, useVectors ? MATCHING.pipeline.candidates : MATCHING.pipeline.noEmbeddingsPool);
    const needs = publicSeeker(ctx.data).helpNeeded;

    const toItem = (s: Scored, score: number, extra: Record<string, unknown>, explanation: string) => ({
      guideId: s.c.guideId,
      score,
      explanation,
      breakdown: { structured: round(s.structured), parts: roundParts(s.parts), vector: useVectors ? round(s.vector) : null, ...extra },
    });

    await replaceMatches(runId, run.seekerId, pool.slice(0, MATCHING.pipeline.results).map((s) => toItem(s, s.preliminary, { stage: "preliminary" }, genericExplanation(s.parts, s.pub, needs))), "preliminary");
    if (pool.length === 0) {
      await setStatus(runId, "done", { finishedAt: new Date(), llmUsed: false });
      return;
    }

    // Stage 2: LLM rerank, or the non-LLM fallback.
    await setStatus(runId, "ranking");
    const top = pool.slice(0, MATCHING.pipeline.rerank);
    const stats = await ratingStats(top.map((s) => s.c.guideId));
    const ratingOf = (s: Scored) => {
      const r = stats.get(s.c.guideId) ?? { count: 0, sum: 0 };
      return { value: ratingScore01(r.count, r.sum), count: r.count, bayes: round(bayesianRating(r.count, r.sum)) };
    };

    const ids = top.map((_, i) => `c${i + 1}`);
    const llmResult = run.degraded ? null : await rerank(publicSeeker(ctx.data), top.map((s, i) => ({ id: ids[i]!, guide: s.pub })));

    let finalItems;
    if (llmResult) {
      finalItems = llmResult
        .map((r) => {
          const s = top[ids.indexOf(r.id)]!;
          const rating = ratingOf(s);
          const final = blend(MATCHING.finalWithLlm, { llm: r.score / 100, structured: s.structured, rating: rating.value });
          return toItem(s, final, { stage: "final", llm: r.score, rating: { count: rating.count, bayes: rating.bayes } }, r.why);
        })
        .sort((a, b) => b.score - a.score);
    } else {
      finalItems = top
        .map((s) => {
          const rating = ratingOf(s);
          const final = useVectors ? blend(MATCHING.finalWithoutLlm, { structured: s.structured, vector: s.vector, rating: rating.value }) : blend({ structured: MATCHING.finalWithoutLlm.structured, rating: MATCHING.finalWithoutLlm.rating }, { structured: s.structured, rating: rating.value });
          return toItem(s, final, { stage: "final", llm: null, rating: { count: rating.count, bayes: rating.bayes } }, genericExplanation(s.parts, s.pub, needs));
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, MATCHING.pipeline.results);
    }
    await replaceMatches(runId, run.seekerId, finalItems, "final");
    await setStatus(runId, "done", { finishedAt: new Date(), llmUsed: Boolean(llmResult), degraded: run.degraded || (e.ENABLE_EMBEDDINGS && !useVectors) });

    await queue().enqueue(db(), "send_email", { kind: "matches_ready", userId: run.seekerId, runId }, { idempotencyKey: `matches_email:${runId}` });
  } catch (err) {
    log.error("match_run.failed", { runId, error: err });
    throw err;
  }
}

/** Marks a run failed once its job has exhausted its retries. */
export async function failRun(runId: string, reason: string) {
  await db().update(matchRuns).set({ status: "failed", error: reason.slice(0, 300), finishedAt: new Date() }).where(and(eq(matchRuns.id, runId), inArray(matchRuns.status, [...ACTIVE])));
}

const round = (n: number) => Math.round(n * 1000) / 1000;
const roundParts = (p: StructuredParts) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, round(v)]));
