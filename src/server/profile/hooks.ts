import "server-only";
import type { Db } from "@/server/db/client";
import { env } from "@/server/env";
import { queue } from "@/server/jobs";

export type ProfileChange = { userId: string; role: "seeker" | "guide"; profileVersion: number };

/**
 * Runs inside the saving transaction after a profile is submitted or its matching-relevant answers
 * change, so the re-embedding job is queued atomically with the change. The job itself skips work when
 * the embedding document is unchanged.
 */
export async function onProfileChanged(tx: unknown, change: ProfileChange) {
  if (!env().ENABLE_EMBEDDINGS) return;
  await queue().enqueue(tx as Pick<Db, "insert">, "embed_profile", { userId: change.userId, role: change.role }, {
    idempotencyKey: `embed:${change.userId}:${change.profileVersion}`,
  });
}
