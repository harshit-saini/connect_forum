import "server-only";
import { Pool as NeonPool, neonConfig } from "@neondatabase/serverless";
import { drizzle as drizzleNeon, type NeonDatabase } from "drizzle-orm/neon-serverless";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import pg from "pg";
import ws from "ws";
import { env } from "@/server/env";
import * as schema from "./schema";

export type Db = NeonDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __db?: Db };

function isNeon(url: string) {
  return /\.neon\.tech/.test(url);
}

function create(): Db {
  const url = env().DATABASE_URL;
  if (isNeon(url)) {
    // Pooled Neon connection over WebSockets: supports transactions and FOR UPDATE SKIP LOCKED.
    neonConfig.webSocketConstructor = ws;
    return drizzleNeon(retryingPool(new NeonPool({ connectionString: url, max: 5, connectionTimeoutMillis: 15_000 })), { schema });
  }
  // Plain Postgres (local dev, CI, tests). Same query API, so it is typed as Db.
  return drizzlePg(retryingPool(new pg.Pool({ connectionString: url, max: 5, connectionTimeoutMillis: 15_000 })), { schema }) as unknown as Db;
}

export function db(): Db {
  return (globalForDb.__db ??= create());
}

/** Errors that happen before any statement reaches the server, so retrying can never repeat a write. */
const NOT_CONNECTED = /ECONNREFUSED|ENOTFOUND|EAI_AGAIN|connect ETIMEDOUT|timeout exceeded when trying to connect|Connection terminated due to connection timeout/i;

type PoolLike = { connect: (...a: never[]) => Promise<unknown>; query: (...a: never[]) => Promise<unknown> };

/**
 * Neon scales to zero, so the first connection after idle time can be slow or refused. Retrying with
 * backoff covers that. Only connection establishment (and errors raised before a statement was sent)
 * is retried: a statement that may have reached the server is never re-sent.
 */
export function retryingPool<T extends PoolLike>(pool: T, attempts = 4): T {
  const connect = pool.connect.bind(pool);
  const query = pool.query.bind(pool);
  pool.connect = ((...args: never[]) => withDbRetry(() => connect(...args), attempts)) as T["connect"];
  pool.query = ((...args: never[]) => withDbRetry(() => query(...args), attempts, NOT_CONNECTED)) as T["query"];
  return pool;
}

const TRANSIENT = /ECONNRESET|ECONNREFUSED|ETIMEDOUT|terminating connection|Connection terminated|timeout|57P0[1-3]|08006|08001/i;

/** Retries a DB operation on transient connection errors (Neon scale-to-zero cold starts). */
export async function withDbRetry<T>(fn: () => Promise<T>, attempts = 4, retryable: RegExp = TRANSIENT): Promise<T> {
  let delay = 250;
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (err) {
      const msg = err instanceof Error ? `${err.message} ${(err as { code?: string }).code ?? ""}` : String(err);
      if (i >= attempts || !retryable.test(msg)) throw err;
      await new Promise((r) => setTimeout(r, delay));
      delay *= 2;
    }
  }
}
