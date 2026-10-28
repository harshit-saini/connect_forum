import { eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { blocks, connectionRequests, guideProfiles, jobs, matchRuns, matches, reports, seekerProfiles, users } from "@/server/db/schema";
import { findCandidates, loadSeekerContext } from "@/server/matching/candidates";
import { executeRun, startRun } from "@/server/matching/pipeline";
import { processJobs } from "@/server/jobs/worker";
import { getRunView } from "@/server/matching/view";
import { randomUUID } from "node:crypto";
import { makeGuide, makeSeeker } from "./fixtures";

beforeAll(async () => {
  await db().delete(users); // cascades: a clean slate so assertions about the pool are exact
  await db().delete(jobs); // a stale backlog would crowd the worker's batch
});

async function candidateIds(seekerId: string) {
  const ctx = (await loadSeekerContext(seekerId, true))!;
  return (await findCandidates(ctx)).map((c) => c.guideId);
}

describe("hard filters", () => {
  it("includes an eligible guide and excludes each ineligible one", async () => {
    const seeker = (await makeSeeker()).user; // career_stagnation, speaks English and Hindi
    const ok = (await makeGuide()).user;
    const paused = (await makeGuide()).user;
    const junior = (await makeGuide({ totalYears: 1 })).user;
    const otherCategory = (await makeGuide({ categories: ["upskilling_training", "layoff_unemployment"] })).user;
    const suspended = (await makeGuide()).user;
    const blockedByGuide = (await makeGuide()).user;
    const reported = (await makeGuide()).user;
    const pending = (await makeGuide()).user;
    const full = (await makeGuide({ maxNewSeekersPerMonth: 1 })).user;
    const legacy = (await makeGuide()).user; // registered before the pilot: no member ID on file

    await db().update(guideProfiles).set({ matchingPaused: true }).where(eq(guideProfiles.userId, paused.id));
    await db().update(guideProfiles).set({ memberId: null }).where(eq(guideProfiles.userId, legacy.id));
    await db().update(users).set({ suspendedAt: new Date() }).where(eq(users.id, suspended.id));
    await db().insert(blocks).values({ blockerId: blockedByGuide.id, blockedId: seeker.id });
    await db().insert(reports).values({ reporterId: seeker.id, reportedId: reported.id, reason: "spam" });
    const req = (guideId: string, status: string, approvedAt?: Date) =>
      db().insert(connectionRequests).values({ seekerId: seeker.id, guideId, status, tokenHash: randomUUID(), expiresAt: new Date(Date.now() + 86400000), approvedAt });
    await req(pending.id, "pending");
    // Capacity: one Seeker already approved this month fills a guide with max 1.
    const other = (await makeSeeker()).user;
    await db().insert(connectionRequests).values({ seekerId: other.id, guideId: full.id, status: "approved", approvedAt: new Date(), tokenHash: randomUUID(), expiresAt: new Date(Date.now() + 86400000) });

    const ids = await candidateIds(seeker.id);
    expect(ids).toContain(ok.id);
    for (const [name, g] of Object.entries({ paused, junior, otherCategory, suspended, blockedByGuide, reported, pending, full, legacy })) {
      expect(ids, name).not.toContain(g.id);
    }
  });

  it("matches a guide who covers the seeker's category among several", async () => {
    const seeker = (await makeSeeker({ category: "uncertainty" })).user;
    const multi = (await makeGuide({ categories: ["layoff_unemployment", "uncertainty", "upskilling_training"] })).user;
    expect(await candidateIds(seeker.id)).toContain(multi.id);
  });

  it("allows a guide again after a past request was declined or expired", async () => {
    const seeker = (await makeSeeker()).user;
    const g = (await makeGuide()).user;
    await db().insert(connectionRequests).values({ seekerId: seeker.id, guideId: g.id, status: "declined", tokenHash: randomUUID(), expiresAt: new Date() });
    expect(await candidateIds(seeker.id)).toContain(g.id);
  });

  it("does not load a legacy seeker (no member ID) for matching", async () => {
    const { user } = await makeSeeker();
    await db().update(seekerProfiles).set({ memberId: null }).where(eq(seekerProfiles.userId, user.id));
    expect(await loadSeekerContext(user.id, true)).toBeNull();
  });
});

describe("the Find guides run", () => {
  it("produces preliminary then final matches with explanations and score breakdowns", async () => {
    const { user: seeker } = await makeSeeker();
    const guides = await Promise.all(Array.from({ length: 7 }, () => makeGuide()));
    await processJobs({ maxMs: 30_000 }); // embeddings

    const start = await startRun(seeker.id, 1);
    expect(start.kind).toBe("started");
    if (start.kind !== "started") return;
    await processJobs({ maxMs: 30_000 });

    const view = (await getRunView(start.runId, seeker.id))!;
    expect(view.status).toBe("done");
    expect(view.matches.length).toBe(5);
    expect(view.llmUsed).toBe(true);
    expect(view.matches.every((m) => m.final && m.explanation.length > 10 && m.alias)).toBe(true);
    expect(view.matches.map((m) => m.rank)).toEqual([1, 2, 3, 4, 5]);
    // scores are descending
    const scores = view.matches.map((m) => m.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);

    const rows = await db().select().from(matches).where(eq(matches.runId, start.runId));
    expect(rows[0]!.scoreBreakdown).toMatchObject({ stage: "final", structured: expect.any(Number), parts: expect.any(Object) });
    const eligible = new Set(await candidateIds(seeker.id));
    expect(rows.every((r) => eligible.has(r.guideId) && r.guideId !== seeker.id)).toBe(true);

    // The card exposes only public fields: no ids, emails, phones or private data.
    const json = JSON.stringify(view);
    expect(json).not.toMatch(/@example\.com|9876543210|Acme|excluded/i);
    expect(json).not.toContain(guides[0]!.user.id);
  });

  it("returns cached results when nothing changed, and blocks a second run during cooldown", async () => {
    const { user: seeker } = await makeSeeker();
    await makeGuide();
    const first = await startRun(seeker.id, 1);
    if (first.kind !== "started") throw new Error("expected started");
    const dup = await startRun(seeker.id, 1);
    expect(dup).toMatchObject({ kind: "active", runId: first.runId }); // one active run per seeker
    await processJobs({ maxMs: 30_000 });

    const again = await startRun(seeker.id, 1);
    expect(again).toMatchObject({ kind: "cached", runId: first.runId });

    // A profile change alters the hash, but the cooldown still applies.
    const changed = await startRun(seeker.id, 2);
    expect(changed).toMatchObject({ kind: "blocked", reason: "cooldown" });
  });

  it("changes the input hash when the guide pool changes", async () => {
    const { user: seeker } = await makeSeeker();
    await makeGuide();
    const first = await startRun(seeker.id, 1);
    if (first.kind !== "started") throw new Error("expected started");
    await processJobs({ maxMs: 30_000 });
    await db().update(matchRuns).set({ startedAt: new Date(Date.now() - 2 * 3600_000) }).where(eq(matchRuns.id, first.runId)); // past cooldown
    await makeGuide(); // bumps guide_pool_version
    expect((await startRun(seeker.id, 1)).kind).toBe("started");
  });

  it("enforces the daily cap", async () => {
    const { user: seeker } = await makeSeeker();
    for (let i = 0; i < 3; i++) {
      await db().insert(matchRuns).values({ seekerId: seeker.id, inputHash: `h${i}`, status: "done", startedAt: new Date(Date.now() - (i + 2) * 3600_000) });
    }
    expect(await startRun(seeker.id, 1)).toMatchObject({ kind: "blocked", reason: "daily_cap" });
  });

  it("falls back to structured ranking, marked degraded, when the seeker has no embedding yet", async () => {
    const { user: seeker } = await makeSeeker();
    await processJobs({ maxMs: 30_000 });
    await db().execute(sql`delete from profile_embeddings where user_id = ${seeker.id}`);
    await makeGuide();
    const run = await startRun(seeker.id, 1);
    if (run.kind !== "started") throw new Error("expected started");
    await executeRun(run.runId);
    const [r] = await db().select().from(matchRuns).where(eq(matchRuns.id, run.runId));
    expect(r!.status).toBe("done");
    expect(r!.degraded).toBe(true);
  });

  it("finishes with zero matches when nobody is eligible", async () => {
    await db().update(guideProfiles).set({ matchingPaused: true });
    const { user: seeker } = await makeSeeker();
    const run = await startRun(seeker.id, 1);
    if (run.kind !== "started") throw new Error("expected started");
    await executeRun(run.runId);
    const view = (await getRunView(run.runId, seeker.id))!;
    expect(view.status).toBe("done");
    expect(view.matches).toEqual([]);
  });

  it("only lets the owning seeker read a run", async () => {
    const { user: a } = await makeSeeker();
    const { user: b } = await makeSeeker();
    const run = await startRun(a.id, 1);
    if (run.kind !== "started") throw new Error("expected started");
    expect(await getRunView(run.runId, b.id)).toBeNull();
  });
});

describe("match ids stay stable when preliminary results become final", () => {
  it("updates rows in place so a card the Seeker is clicking never disappears", async () => {
    const { user: seeker } = await makeSeeker();
    await makeGuide();
    await makeGuide();
    const run = await startRun(seeker.id, 1);
    if (run.kind !== "started") throw new Error("expected started");
    await executeRun(run.runId);
    const before = await db().select().from(matches).where(eq(matches.runId, run.runId));
    // Simulate a preliminary snapshot being read, then the final stage re-running over the same run.
    await db().update(matchRuns).set({ status: "queued" }).where(eq(matchRuns.id, run.runId));
    await executeRun(run.runId);
    const after = await db().select().from(matches).where(eq(matches.runId, run.runId));
    const idsBefore = new Map(before.map((m) => [m.guideId, m.id]));
    const kept = after.filter((m) => idsBefore.has(m.guideId));
    expect(kept.length).toBeGreaterThan(0);
    expect(kept.every((m) => idsBefore.get(m.guideId) === m.id)).toBe(true);
  });
});
