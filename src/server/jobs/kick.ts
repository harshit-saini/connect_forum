import "server-only";
import { after } from "next/server";
import { log } from "@/server/logging/logger";
import { processJobs } from "./worker";

/**
 * Starts the worker after the current response. Call it after the transaction that enqueued work has
 * committed. Outside a request (scripts, tests) it does nothing; the cron safety net will pick jobs up.
 */
export function kickWorker() {
  try {
    after(() => processJobs().then(() => undefined, (err) => log.error("worker.kick_failed", { error: err })));
  } catch {
    /* not in a request scope */
  }
}
