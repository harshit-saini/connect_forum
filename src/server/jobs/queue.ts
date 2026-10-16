import "server-only";
import { sql } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { jobs } from "@/server/db/schema";

export type JobType = "embed_profile" | "match_run" | "send_email" | "rating_reminder";

export type JobRecord = {
  id: string;
  type: JobType;
  payload: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
};

export type EnqueueOptions = { runAt?: Date; idempotencyKey?: string; maxAttempts?: number };

/**
 * The queue contract. The Postgres implementation below can be swapped for a hosted queue
 * (QStash, Inngest) by implementing this interface.
 */
export interface JobQueue {
  enqueue(tx: Pick<Db, "insert">, type: JobType, payload: Record<string, unknown>, opts?: EnqueueOptions): Promise<{ id: string | null; created: boolean }>;
  /** Claims at most one runnable job, or null. Honours the global match_run concurrency cap. */
  claimOne(): Promise<JobRecord | null>;
  heartbeat(id: string): Promise<void>;
  complete(id: string): Promise<void>;
  /** Records a failure: retried with exponential backoff until max attempts, then marked dead. */
  fail(id: string, error: unknown): Promise<"retry" | "dead">;
  /** Re-queues running jobs whose heartbeat is older than `staleMs`. Returns how many were touched. */
  requeueStale(staleMs: number): Promise<number>;
}

const CLAIM_LOCK = 727_001;
export const BACKOFF_BASE_SECONDS = 30;

function rows<T>(res: unknown): T[] {
  return (res as { rows: T[] }).rows;
}

export function createPgQueue(db: Db, opts: { matchCap: number }): JobQueue {
  return {
    async enqueue(tx, type, payload, o = {}) {
      const inserted = await tx
        .insert(jobs)
        .values({ type, payload, runAt: o.runAt ?? new Date(), idempotencyKey: o.idempotencyKey, maxAttempts: o.maxAttempts ?? 5 })
        .onConflictDoNothing({ target: jobs.idempotencyKey })
        .returning({ id: jobs.id });
      return { id: inserted[0]?.id ?? null, created: inserted.length > 0 };
    },

    async claimOne() {
      return db.transaction(async (tx) => {
        // Serialise claimers so the match_run cap cannot be overshot by two simultaneous claims.
        await tx.execute(sql`select pg_advisory_xact_lock(${CLAIM_LOCK})`);
        const res = await tx.execute(sql`
          with picked as (
            select id from jobs
            where status in ('queued', 'failed') and run_at <= now()
              and (type <> 'match_run' or (select count(*) from jobs where type = 'match_run' and status = 'running') < ${opts.matchCap})
            order by run_at
            limit 1
            for update skip locked
          )
          update jobs set status = 'running', attempts = attempts + 1, locked_at = now(), heartbeat_at = now()
          where id in (select id from picked)
          returning id, type, payload, attempts, max_attempts as "maxAttempts"`);
        return rows<JobRecord>(res)[0] ?? null;
      });
    },

    async heartbeat(id) {
      await db.execute(sql`update jobs set heartbeat_at = now() where id = ${id} and status = 'running'`);
    },

    async complete(id) {
      await db.execute(sql`update jobs set status = 'done', finished_at = now(), last_error = null where id = ${id}`);
    },

    async fail(id, error) {
      const message = (error instanceof Error ? error.message : String(error)).slice(0, 500);
      const res = await db.execute(sql`
        update jobs set
          status = case when attempts >= max_attempts then 'dead' else 'failed' end,
          run_at = now() + (${BACKOFF_BASE_SECONDS} * power(2, attempts - 1)) * interval '1 second',
          finished_at = case when attempts >= max_attempts then now() else null end,
          last_error = ${message}
        where id = ${id}
        returning status`);
      return rows<{ status: string }>(res)[0]?.status === "dead" ? "dead" : "retry";
    },

    async requeueStale(staleMs) {
      const res = await db.execute(sql`
        update jobs set
          status = case when attempts >= max_attempts then 'dead' else 'queued' end,
          locked_at = null,
          last_error = 'stalled: no heartbeat'
        where status = 'running' and heartbeat_at < now() - (${staleMs} * interval '1 millisecond')
        returning id`);
      return rows<{ id: string }>(res).length;
    },
  };
}
