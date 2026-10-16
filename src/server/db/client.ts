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
    return drizzleNeon(new NeonPool({ connectionString: url, max: 5 }), { schema });
  }
  // Plain Postgres (local dev, CI, tests). Same query API, so it is typed as Db.
  return drizzlePg(new pg.Pool({ connectionString: url, max: 5 }), { schema }) as unknown as Db;
}

export function db(): Db {
  return (globalForDb.__db ??= create());
}

const TRANSIENT = /ECONNRESET|ECONNREFUSED|ETIMEDOUT|terminating connection|Connection terminated|timeout|57P0[1-3]|08006|08001/i;

/** Retries a DB operation on transient connection errors (Neon scale-to-zero cold starts). */
export async function withDbRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  let delay = 250;
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (err) {
      const msg = err instanceof Error ? `${err.message} ${(err as { code?: string }).code ?? ""}` : String(err);
      if (i >= attempts || !TRANSIENT.test(msg)) throw err;
      await new Promise((r) => setTimeout(r, delay));
      delay *= 2;
    }
  }
}
