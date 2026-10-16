import { desc, eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { connectionRequests, counters, devOutbox, jobs, matchRuns, matches, ratings, users } from "@/server/db/schema";
import { createRequest, decide } from "@/server/connections/service";
import { runHousekeeping } from "@/server/housekeeping";
import { processJobs } from "@/server/jobs/worker";
import { queue } from "@/server/jobs";
import { executeRun, startRun } from "@/server/matching/pipeline";
import { getOwnRating, guideRatingSummary, submitRating } from "@/server/ratings/service";
import { createUser, makeGuide, makeSeeker } from "./fixtures";

beforeAll(async () => {
  await db().delete(users);
  await db().delete(jobs);
});

async function approvedPair() {
  const seeker = await makeSeeker();
  const guide = await makeGuide();
  const [run] = await db().insert(matchRuns).values({ seekerId: seeker.user.id, inputHash: randomUUID(), status: "done" }).returning();
  const [m] = await db().insert(matches).values({ runId: run!.id, seekerId: seeker.user.id, guideId: guide.user.id, rank: 1, score: 0.9, status: "final" }).returning();
  const r = await createRequest({ seekerId: seeker.user.id, matchId: m!.id });
  if (!r.ok) throw new Error("request failed");
  await processJobs({ maxMs: 20_000 });
  const mail = (await db().select().from(devOutbox).where(eq(devOutbox.to, guide.user.email)).orderBy(desc(devOutbox.createdAt)))[0]!;
  const token = /\/review\/([A-Za-z0-9_-]{43})/.exec(mail.text)![1]!;
  await decide(token, "approve");
  return { seeker, guide, requestId: r.requestId };
}

/** Inserts `n` ratings of `score` for a guide, each from its own approved connection. */
async function seedRatings(guideId: string, n: number, score: number) {
  for (let i = 0; i < n; i++) {
    const s = await createUser("seeker");
    const [c] = await db().insert(connectionRequests).values({ seekerId: s.id, guideId, status: "approved", approvedAt: new Date(Date.now() - 40 * 86_400_000), tokenHash: randomUUID(), expiresAt: new Date() }).returning();
    await db().insert(ratings).values({ connectionRequestId: c!.id, seekerId: s.id, guideId, score });
  }
}

const ratingsVersion = async () => (await db().select().from(counters).where(eq(counters.name, "ratings_version")))[0]?.value ?? 0;

describe("submitRating", () => {
  it("validates the score and review, and only for the owner's approved connection", async () => {
    const p = await approvedPair();
    const send = (over: object) => submitRating({ seekerId: p.seeker.user.id, connectionId: p.requestId, score: 4, ...over });
    for (const score of [0, 6, 2.5, "abc", null]) expect(await send({ score }), String(score)).toMatchObject({ ok: false, code: "invalid" });
    expect(await send({ review: "great, call me on 98765 43210" })).toMatchObject({ ok: false, code: "invalid", message: expect.stringContaining("remove contact details") });
    expect(await submitRating({ seekerId: (await makeSeeker()).user.id, connectionId: p.requestId, score: 5 })).toMatchObject({ ok: false, code: "not_found" });

    // not yet approved
    const seeker = await makeSeeker();
    const guide = await makeGuide();
    const [run] = await db().insert(matchRuns).values({ seekerId: seeker.user.id, inputHash: randomUUID(), status: "done" }).returning();
    const [m] = await db().insert(matches).values({ runId: run!.id, seekerId: seeker.user.id, guideId: guide.user.id, rank: 1, score: 0.5, status: "final" }).returning();
    const pending = await createRequest({ seekerId: seeker.user.id, matchId: m!.id });
    if (!pending.ok) throw new Error("x");
    expect(await submitRating({ seekerId: seeker.user.id, connectionId: pending.requestId, score: 5 })).toMatchObject({ ok: false, code: "not_approved" });
  });

  it("allows one rating per connection, editable for 7 days, and invalidates cached matches", async () => {
    const p = await approvedPair();
    const v0 = await ratingsVersion();
    expect(await submitRating({ seekerId: p.seeker.user.id, connectionId: p.requestId, score: 4, review: "Helpful session" })).toEqual({ ok: true, edited: false });
    expect(await ratingsVersion()).toBe(v0 + 1);

    expect(await submitRating({ seekerId: p.seeker.user.id, connectionId: p.requestId, score: 2 })).toEqual({ ok: true, edited: true });
    const rows = await db().select().from(ratings).where(eq(ratings.connectionRequestId, p.requestId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ score: 2, review: null });
    expect((await getOwnRating(p.seeker.user.id, p.requestId))?.locked).toBe(false);

    await db().update(ratings).set({ createdAt: new Date(Date.now() - 8 * 86_400_000) }).where(eq(ratings.connectionRequestId, p.requestId));
    expect(await submitRating({ seekerId: p.seeker.user.id, connectionId: p.requestId, score: 5 })).toMatchObject({ ok: false, code: "locked" });
    expect((await getOwnRating(p.seeker.user.id, p.requestId))?.locked).toBe(true);
    expect((await db().select().from(ratings).where(eq(ratings.connectionRequestId, p.requestId)))[0]!.score).toBe(2);
  });
});

describe("what a guide can see", () => {
  it("is hidden until 3 ratings, then only an average and a count", async () => {
    const g = await makeGuide();
    expect(await guideRatingSummary(g.user.id)).toEqual({ count: 0, average: null, needed: 3 });
    await seedRatings(g.user.id, 2, 5);
    expect(await guideRatingSummary(g.user.id)).toEqual({ count: 2, average: null, needed: 1 });
    await seedRatings(g.user.id, 1, 4);
    const s = await guideRatingSummary(g.user.id);
    expect(s).toEqual({ count: 3, average: 4.7, needed: 0 });
    expect(Object.keys(s).sort()).toEqual(["average", "count", "needed"]); // no reviews, no individual scores
  });
});

describe("rating reminder", () => {
  it("is scheduled RATING_DELAY_DAYS after approval, sent once when due, and skipped if already rated", async () => {
    const p = await approvedPair();
    const [job] = await db().select().from(jobs).where(eq(jobs.idempotencyKey, `rating_reminder:${p.requestId}`));
    const days = (job!.runAt.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(2.9);
    expect(days).toBeLessThan(3.1);

    const reminders = async () => (await db().select().from(devOutbox).where(eq(devOutbox.to, p.seeker.user.email))).filter((m) => m.subject === "How was your Guide?");
    await processJobs({ maxMs: 20_000 });
    expect(await reminders()).toHaveLength(0); // not due yet

    await db().update(jobs).set({ runAt: new Date(Date.now() - 1000) }).where(eq(jobs.id, job!.id));
    await processJobs({ maxMs: 20_000 });
    const sent = await reminders();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.text).toContain(`/seeker/rate/${p.requestId}`);
    expect(sent[0]!.text).not.toContain("@example.com");

    // already-rated seekers are not nagged
    const q = await approvedPair();
    await submitRating({ seekerId: q.seeker.user.id, connectionId: q.requestId, score: 5 });
    const [qj] = await db().select().from(jobs).where(eq(jobs.idempotencyKey, `rating_reminder:${q.requestId}`));
    await db().update(jobs).set({ runAt: new Date(Date.now() - 1000) }).where(eq(jobs.id, qj!.id));
    await processJobs({ maxMs: 20_000 });
    expect((await db().select().from(devOutbox).where(eq(devOutbox.to, q.seeker.user.email))).filter((m) => m.subject === "How was your Guide?")).toHaveLength(0);
  });
});

describe("ratings feed matching", () => {
  it("lifts a well-rated guide above an identical unrated one, and drops a badly rated one below it", async () => {
    await db().delete(users);
    await db().delete(jobs);
    const seeker = (await makeSeeker()).user;
    const good = (await makeGuide()).user;
    const none = (await makeGuide()).user;
    const bad = (await makeGuide()).user;
    await seedRatings(good.id, 12, 5);
    await seedRatings(bad.id, 12, 1);
    await processJobs({ maxMs: 30_000 });

    const run = await startRun(seeker.id, 1);
    if (run.kind !== "started") throw new Error("expected started");
    await executeRun(run.runId);
    const rows = await db().select().from(matches).where(eq(matches.runId, run.runId));
    const byGuide = new Map(rows.map((r) => [r.guideId, r]));
    expect(byGuide.get(good.id)!.score).toBeGreaterThan(byGuide.get(none.id)!.score);
    expect(byGuide.get(none.id)!.score).toBeGreaterThan(byGuide.get(bad.id)!.score);
    expect(byGuide.get(good.id)!.scoreBreakdown).toMatchObject({ rating: { count: 12 } });
  });

  it("a new rating makes the cached result stale", async () => {
    const seeker = (await makeSeeker()).user;
    const first = await startRun(seeker.id, 1);
    if (first.kind !== "started") throw new Error("expected started");
    await executeRun(first.runId);
    expect((await startRun(seeker.id, 1)).kind).toBe("cached");
    const g = await makeGuide();
    await seedRatings(g.user.id, 1, 5);
    const p = await approvedPair();
    await submitRating({ seekerId: p.seeker.user.id, connectionId: p.requestId, score: 5 });
    await db().update(matchRuns).set({ startedAt: new Date(Date.now() - 2 * 3600_000) }).where(eq(matchRuns.id, first.runId)); // past cooldown
    expect((await startRun(seeker.id, 1)).kind).toBe("started");
  });
});

describe("housekeeping", () => {
  it("requeues stalled jobs, fails dead runs, expires requests, delivers due reminders, and is idempotent", async () => {
    const p = await approvedPair();
    const [rem] = await db().select().from(jobs).where(eq(jobs.idempotencyKey, `rating_reminder:${p.requestId}`));
    await db().update(jobs).set({ runAt: new Date(Date.now() - 1000) }).where(eq(jobs.id, rem!.id));

    // an overdue request
    await approvedPair();
    const g3 = await makeGuide();
    const s3 = await makeSeeker();
    await db().insert(connectionRequests).values({ seekerId: s3.user.id, guideId: g3.user.id, status: "pending", tokenHash: randomUUID(), expiresAt: new Date(Date.now() - 1000) });

    // a stalled job
    const { id: stalledId } = await queue().enqueue(db(), "send_email", { kind: "unknown_but_harmless", userId: p.seeker.user.id });
    await db().execute(sql`update jobs set status = 'running', heartbeat_at = now() - interval '10 minutes', attempts = 1 where id = ${stalledId}`);
    // a dead match job for an active run
    const s2 = await makeSeeker();
    const [run] = await db().insert(matchRuns).values({ seekerId: s2.user.id, inputHash: "h", status: "ranking" }).returning();
    await queue().enqueue(db(), "match_run", { runId: run!.id }, { maxAttempts: 1 });
    await db().execute(sql`update jobs set status = 'dead' where type = 'match_run' and payload->>'runId' = ${run!.id}`);
    const first = await runHousekeeping();
    expect(first.requeued).toBeGreaterThanOrEqual(1);
    expect(first.failedRuns).toBeGreaterThanOrEqual(1);
    expect(first.expiredRequests).toBeGreaterThanOrEqual(1);
    expect((await db().select().from(matchRuns).where(eq(matchRuns.id, run!.id)))[0]!.status).toBe("failed");
    expect((await db().select().from(devOutbox).where(eq(devOutbox.to, p.seeker.user.email))).some((m) => m.subject === "How was your Guide?")).toBe(true);

    const second = await runHousekeeping();
    expect(second.expiredRequests).toBe(0);
    expect(second.requeued).toBe(0);
  });

  it("the cron route requires the bearer secret", async () => {
    const { GET } = await import("@/app/api/cron/housekeeping/route");
    expect((await GET(new Request("http://localhost/api/cron/housekeeping"))).status).toBe(401);
    expect((await GET(new Request("http://localhost/api/cron/housekeeping", { headers: { authorization: "Bearer wrong" } }))).status).toBe(401);
    const ok = await GET(new Request("http://localhost/api/cron/housekeeping", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toHaveProperty("jobsProcessed");
  });
});
