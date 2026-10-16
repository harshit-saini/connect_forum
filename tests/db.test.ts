import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db/client";

describe("database", () => {
  it("is reachable and has the pgvector extension", async () => {
    const res = await db().execute(sql`select extname from pg_extension where extname = 'vector'`);
    expect(res.rows).toHaveLength(1);
  });
});
