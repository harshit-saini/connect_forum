import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// MATCH_FALLBACK_ANY_CATEGORY is read once per process, so this file loads the app fresh with it on.
const original = process.env.MATCH_FALLBACK_ANY_CATEGORY;

describe("MATCH_FALLBACK_ANY_CATEGORY=true (demo safety net)", () => {
  beforeAll(() => {
    process.env.MATCH_FALLBACK_ANY_CATEGORY = "true";
    vi.resetModules();
  });
  afterAll(() => {
    if (original === undefined) delete process.env.MATCH_FALLBACK_ANY_CATEGORY;
    else process.env.MATCH_FALLBACK_ANY_CATEGORY = original;
    vi.resetModules();
  });

  it("still matches a Seeker with nobody in their category, and ranks their own category first when there is one", async () => {
    const { db } = await import("@/server/db/client");
    const { blocks, guideProfiles, jobs, matches, users } = await import("@/server/db/schema");
    const { makeGuide, makeSeeker } = await import("./fixtures");
    const { processJobs } = await import("@/server/jobs/worker");
    const { startRun } = await import("@/server/matching/pipeline");
    const { getRunView } = await import("@/server/matching/view");

    await db().delete(users);
    await db().delete(jobs);

    // Nobody covers "layoff_unemployment": the Seeker still gets the closest Guides.
    const lonely = (await makeSeeker({ category: "layoff_unemployment" })).user;
    const a = (await makeGuide({ categories: ["uncertainty"], totalYears: 8 })).user;
    const b = (await makeGuide({ categories: ["upskilling_training"], totalYears: 15 })).user;
    const run1 = await startRun(lonely.id, 1);
    if (run1.kind !== "started") throw new Error("expected started");
    await processJobs({ maxMs: 30_000 });
    const view1 = (await getRunView(run1.runId, lonely.id))!;
    expect(view1.status).toBe("done");
    expect(view1.matches).toHaveLength(2);
    expect(view1.matches.every((m) => m.explanation.length > 10)).toBe(true);

    // When a Guide does cover the category, that Guide ranks above more experienced off-category ones.
    const seeker = (await makeSeeker({ category: "career_stagnation" })).user;
    const own = (await makeGuide({ categories: ["career_stagnation"], totalYears: 4 })).user;
    const run2 = await startRun(seeker.id, 1);
    if (run2.kind !== "started") throw new Error("expected started");
    await processJobs({ maxMs: 30_000 });
    const rows = await db().select().from(matches).where(eq(matches.runId, run2.runId));
    const rank = new Map(rows.map((r) => [r.guideId, r.rank]));
    expect(rank.get(own.id)).toBe(1);
    expect(rank.has(a.id) && rank.has(b.id)).toBe(true);

    // Everything else still applies: a paused, blocked or already-connected Guide is never offered.
    const blocked = (await makeGuide({ categories: ["career_stagnation"] })).user;
    const paused = (await makeGuide({ categories: ["career_stagnation"] })).user;
    await db().insert(blocks).values({ blockerId: blocked.id, blockedId: lonely.id });
    await db().update(guideProfiles).set({ matchingPaused: true }).where(eq(guideProfiles.userId, paused.id));
    const { findCandidates, loadSeekerContext } = await import("@/server/matching/candidates");
    const ids = (await findCandidates((await loadSeekerContext(lonely.id, false))!)).map((c) => c.guideId);
    expect(ids).not.toContain(blocked.id);
    expect(ids).not.toContain(paused.id);
    expect(ids).toContain(a.id);
  });
});
