import "server-only";
import { db } from "@/server/db/client";
import { env } from "@/server/env";
import { createPgQueue, type JobQueue } from "./queue";

const g = globalThis as unknown as { __queue?: JobQueue };

export function queue(): JobQueue {
  return (g.__queue ??= createPgQueue(db(), { matchCap: env().MATCH_MAX_CONCURRENCY }));
}

export type { JobQueue, JobType, JobRecord } from "./queue";
