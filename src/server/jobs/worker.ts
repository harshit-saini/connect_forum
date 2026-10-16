import "server-only";
import { log } from "@/server/logging/logger";
import { handlers } from "./handlers";
import { queue, type JobRecord } from "./index";

const HEARTBEAT_MS = 30_000;
export const STALE_AFTER_MS = 5 * 60_000;

async function runOne(job: JobRecord) {
  const q = queue();
  const started = Date.now();
  const beat = setInterval(() => void q.heartbeat(job.id).catch(() => undefined), HEARTBEAT_MS);
  try {
    const handler = handlers[job.type];
    if (!handler) throw new Error(`No handler for job type ${job.type}`);
    await handler(job);
    await q.complete(job.id);
    log.info("job.done", { jobId: job.id, type: job.type, ms: Date.now() - started });
  } catch (err) {
    const outcome = await q.fail(job.id, err);
    log.warn("job.failed", { jobId: job.id, type: job.type, attempt: job.attempts, outcome, error: err });
  } finally {
    clearInterval(beat);
  }
}

/**
 * Claims and runs jobs until none are runnable or the time budget is spent. Safe to run concurrently
 * from several invocations: claiming is atomic. Returns the number of jobs attempted.
 */
export async function processJobs(opts: { maxMs?: number; maxJobs?: number } = {}): Promise<number> {
  const deadline = Date.now() + (opts.maxMs ?? 50_000);
  const maxJobs = opts.maxJobs ?? 25;
  let n = 0;
  while (n < maxJobs && Date.now() < deadline) {
    const job = await queue().claimOne();
    if (!job) break;
    await runOne(job);
    n++;
  }
  return n;
}
