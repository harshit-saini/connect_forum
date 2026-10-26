import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// AI_ENABLED is read once per process, so this file loads the app fresh with it switched off.
const original = process.env.AI_ENABLED;

describe("AI_ENABLED=false", () => {
  beforeAll(() => {
    process.env.AI_ENABLED = "false";
    vi.resetModules();
  });
  afterAll(() => {
    if (original === undefined) delete process.env.AI_ENABLED;
    else process.env.AI_ENABLED = original;
    vi.resetModules();
  });

  it("matches from the profile alone: no embeddings, no LLM, plain explanations, not degraded", async () => {
    const { db } = await import("@/server/db/client");
    const { jobs, matches, matchRuns, profileEmbeddings, users } = await import("@/server/db/schema");
    const { makeGuide, makeSeeker } = await import("./fixtures");
    const { processJobs } = await import("@/server/jobs/worker");
    const { startRun } = await import("@/server/matching/pipeline");
    const { getRunView } = await import("@/server/matching/view");
    const { env } = await import("@/server/env");
    const llm = await import("@/server/ai/llm");
    const llmSpy = vi.spyOn(llm, "llmProvider");

    expect(env().AI_ENABLED).toBe(false);
    expect(env().ENABLE_EMBEDDINGS).toBe(false); // switched off with it, whatever ENABLE_EMBEDDINGS says

    await db().delete(users);
    await db().delete(jobs);
    const seeker = (await makeSeeker()).user;
    const strong = (await makeGuide({ totalYears: 20, categories: ["career_stagnation"] })).user;
    const weak = (await makeGuide({ totalYears: 4, categories: ["career_stagnation", "uncertainty", "upskilling_training"] })).user;
    const wrongCategory = (await makeGuide({ categories: ["uncertainty"] })).user;

    expect((await db().select().from(jobs)).filter((j) => j.type === "embed_profile")).toHaveLength(0);
    expect(await db().select().from(profileEmbeddings)).toHaveLength(0);

    const run = await startRun(seeker.id, 1);
    if (run.kind !== "started") throw new Error("expected started");
    expect(run.degraded).toBe(false);
    await processJobs({ maxMs: 30_000 });

    const view = (await getRunView(run.runId, seeker.id))!;
    expect(view.status).toBe("done");
    expect(view.llmUsed).toBe(false);
    expect(view.degraded).toBe(false); // profile matching is the normal path, not a fallback
    expect(view.matches.map((m) => m.alias)).toHaveLength(2);
    expect(view.matches.every((m) => m.final && m.explanation.length > 10)).toBe(true);
    // The more experienced, more focused Guide ranks first; a Guide outside the category is not matched.
    const rows = await db().select().from(matches).where(eq(matches.runId, run.runId));
    const byGuide = new Map(rows.map((r) => [r.guideId, r.rank]));
    expect(byGuide.get(strong.id)).toBe(1);
    expect(byGuide.get(weak.id)).toBe(2);
    expect(byGuide.has(wrongCategory.id)).toBe(false);
    expect(rows.every((r) => (r.scoreBreakdown as { llm: unknown; vector: unknown }).llm === null && (r.scoreBreakdown as { vector: unknown }).vector === null)).toBe(true);

    const [r] = await db().select().from(matchRuns).where(eq(matchRuns.id, run.runId));
    expect(r!.llmUsed).toBe(false);
    expect(llmSpy).not.toHaveBeenCalled();
  });

  it("refuses to build an AI provider", async () => {
    const { llmProvider } = await import("@/server/ai/llm");
    const { embeddingProvider } = await import("@/server/ai/embeddings");
    expect(() => llmProvider()).toThrow(/AI is disabled/);
    expect(() => embeddingProvider()).toThrow(/AI is disabled/);
  });
});
