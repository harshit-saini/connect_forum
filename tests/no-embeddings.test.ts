import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// ENABLE_EMBEDDINGS is read once per process, so this file loads the app fresh with it switched off.
const original = process.env.ENABLE_EMBEDDINGS;

describe("ENABLE_EMBEDDINGS=false", () => {
  beforeAll(() => {
    process.env.ENABLE_EMBEDDINGS = "false";
    vi.resetModules();
  });
  afterAll(() => {
    if (original === undefined) delete process.env.ENABLE_EMBEDDINGS;
    else process.env.ENABLE_EMBEDDINGS = original;
    vi.resetModules();
  });

  it("queues no embedding jobs, skips vectors, and still ranks and explains matches", async () => {
    const { db } = await import("@/server/db/client");
    const { jobs, matches, matchRuns, profileEmbeddings, users } = await import("@/server/db/schema");
    const { makeGuide, makeSeeker } = await import("./fixtures");
    const { processJobs } = await import("@/server/jobs/worker");
    const { startRun } = await import("@/server/matching/pipeline");
    const { getRunView } = await import("@/server/matching/view");

    await db().delete(users);
    await db().delete(jobs);
    const seeker = (await makeSeeker()).user;
    const guides = [];
    for (let i = 0; i < 4; i++) guides.push((await makeGuide()).user);

    // Profile submission enqueued no embed jobs, so there are no vectors at all.
    expect((await db().select().from(jobs)).filter((j) => j.type === "embed_profile")).toHaveLength(0);
    expect(await db().select().from(profileEmbeddings)).toHaveLength(0);

    const run = await startRun(seeker.id, 1);
    if (run.kind !== "started") throw new Error("expected started");
    await processJobs({ maxMs: 30_000 });

    const view = (await getRunView(run.runId, seeker.id))!;
    expect(view.status).toBe("done");
    expect(view.matches.length).toBe(4);
    expect(view.matches.every((m) => m.final && m.explanation.length > 10)).toBe(true);
    const rows = await db().select().from(matches).where(eq(matches.runId, run.runId));
    expect(rows.every((r) => (r.scoreBreakdown as { vector: unknown }).vector === null)).toBe(true);
    const [r] = await db().select().from(matchRuns).where(eq(matchRuns.id, run.runId));
    expect(r!.degraded).toBe(false); // switched off on purpose is not a degraded run
    void guides;
  });
});
