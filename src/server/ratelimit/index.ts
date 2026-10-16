import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/server/db/client";

export type RateLimitResult = { allowed: boolean; remaining: number; retryAfterSeconds: number };

/**
 * Fixed-window counter in Postgres: one atomic upsert per check, no Redis needed. `key` should combine a
 * scope and a subject, e.g. `reveal:${userId}`. Keys never include contact details.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
  const res = await db().execute(sql`
    insert into rate_limits (key, window_start, count) values (${key}, now(), 1)
    on conflict (key) do update set
      window_start = case when rate_limits.window_start < now() - (${windowSeconds} * interval '1 second') then now() else rate_limits.window_start end,
      count = case when rate_limits.window_start < now() - (${windowSeconds} * interval '1 second') then 1 else rate_limits.count + 1 end
    returning count, greatest(0, ceil(extract(epoch from (window_start + (${windowSeconds} * interval '1 second') - now()))))::int as retry`);
  const row = (res as unknown as { rows: { count: number; retry: number }[] }).rows[0]!;
  return { allowed: row.count <= limit, remaining: Math.max(0, limit - row.count), retryAfterSeconds: row.retry };
}

export function tooManyRequests(result: RateLimitResult, message = "Too many requests. Please try again later.") {
  return Response.json({ error: message, retryAfterSeconds: result.retryAfterSeconds }, { status: 429, headers: { "Retry-After": String(result.retryAfterSeconds), "Cache-Control": "no-store" } });
}
