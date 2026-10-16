import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { jobs } from "@/server/db/schema";
import { createPgQueue } from "@/server/jobs/queue";

const q = (cap = 5) => createPgQueue(db(), { matchCap: cap });
const status = async (id: string) => (await db().select().from(jobs).where(eq(jobs.id, id)))[0]!;

beforeEach(async () => {
  await db().delete(jobs);
});

describe("pg job queue", () => {
  it("never hands the same job to two concurrent claimers", async () => {
    const queue = q();
    for (let i = 0; i < 12; i++) await queue.enqueue(db(), "send_email", { i });
    const claimed = (await Promise.all(Array.from({ length: 20 }, () => queue.claimOne()))).filter(Boolean);
    expect(claimed).toHaveLength(12);
    expect(new Set(claimed.map((j) => j!.id)).size).toBe(12);
    expect(await queue.claimOne()).toBeNull();
  });

  it("deduplicates by idempotency key", async () => {
    const queue = q();
    const a = await queue.enqueue(db(), "embed_profile", { x: 1 }, { idempotencyKey: "k1" });
    const b = await queue.enqueue(db(), "embed_profile", { x: 1 }, { idempotencyKey: "k1" });
    expect(a.created).toBe(true);
    expect(b.created).toBe(false);
    expect((await db().select().from(jobs)).length).toBe(1);
  });

  it("does not claim jobs scheduled for the future", async () => {
    const queue = q();
    await queue.enqueue(db(), "rating_reminder", {}, { runAt: new Date(Date.now() + 3_600_000) });
    expect(await queue.claimOne()).toBeNull();
  });

  it("retries with exponential backoff, then marks the job dead", async () => {
    const queue = q();
    const { id } = await queue.enqueue(db(), "send_email", {}, { maxAttempts: 2 });
    const first = (await queue.claimOne())!;
    expect(first.attempts).toBe(1);
    expect(await queue.fail(first.id, new Error("boom"))).toBe("retry");
    let row = await status(id!);
    expect(row.status).toBe("failed");
    expect(row.runAt.getTime()).toBeGreaterThan(Date.now() + 20_000);
    expect(await queue.claimOne()).toBeNull(); // backing off

    await db().update(jobs).set({ runAt: new Date() }).where(eq(jobs.id, id!));
    const second = (await queue.claimOne())!;
    expect(second.attempts).toBe(2);
    expect(await queue.fail(second.id, new Error("boom again"))).toBe("dead");
    row = await status(id!);
    expect(row.status).toBe("dead");
    expect(row.lastError).toBe("boom again");
  });

  it("caps concurrent match_run jobs globally but not other types", async () => {
    const queue = q(2);
    for (let i = 0; i < 4; i++) await queue.enqueue(db(), "match_run", { i });
    await queue.enqueue(db(), "send_email", {});
    const first = (await Promise.all([queue.claimOne(), queue.claimOne(), queue.claimOne(), queue.claimOne()])).filter(Boolean);
    const types = first.map((j) => j!.type).sort();
    expect(types).toEqual(["match_run", "match_run", "send_email"]);
    const running = first.find((j) => j!.type === "match_run")!;
    await queue.complete(running.id);
    expect((await queue.claimOne())?.type).toBe("match_run");
  });

  it("requeues jobs whose heartbeat went silent and gives up after max attempts", async () => {
    const queue = q();
    const { id } = await queue.enqueue(db(), "match_run", {}, { maxAttempts: 2 });
    await queue.claimOne();
    expect(await queue.requeueStale(5 * 60_000)).toBe(0); // fresh heartbeat
    await db().update(jobs).set({ heartbeatAt: sql`now() - interval '6 minutes'` }).where(eq(jobs.id, id!));
    expect(await queue.requeueStale(5 * 60_000)).toBe(1);
    expect((await status(id!)).status).toBe("queued");

    await queue.claimOne(); // attempt 2
    await db().update(jobs).set({ heartbeatAt: sql`now() - interval '6 minutes'` }).where(eq(jobs.id, id!));
    await queue.requeueStale(5 * 60_000);
    expect((await status(id!)).status).toBe("dead");
  });

  it("completed jobs are not claimed again", async () => {
    const queue = q();
    await queue.enqueue(db(), "send_email", {});
    const j = (await queue.claimOne())!;
    await queue.complete(j.id);
    expect(await queue.claimOne()).toBeNull();
  });
});
