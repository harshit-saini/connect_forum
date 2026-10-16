import "server-only";
import { sql } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { counters } from "@/server/db/schema";

type Tx = Pick<Db, "insert">;

/** Atomically increments a named counter and returns the new value. */
export async function bumpCounter(tx: Tx, name: string): Promise<number> {
  const [row] = await tx
    .insert(counters)
    .values({ name, value: 1 })
    .onConflictDoUpdate({ target: counters.name, set: { value: sql`${counters.value} + 1`, updatedAt: sql`now()` } })
    .returning({ value: counters.value });
  return row!.value;
}

export const GUIDE_POOL_VERSION = "guide_pool_version";
export const RATINGS_VERSION = "ratings_version";
