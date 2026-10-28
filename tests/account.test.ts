import { and, eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db/client";
import { auditLog, connectionRequests, counters, matchRuns, matches, phoneVault, profileEmbeddings, ratings, rateLimits, sessions, users } from "@/server/db/schema";
import { buildExport, deleteAccount } from "@/server/account";
import { createRequest, decide } from "@/server/connections/service";
import { processJobs } from "@/server/jobs/worker";
import { submitRating } from "@/server/ratings/service";
import { devOutbox } from "@/server/db/schema";
import { desc } from "drizzle-orm";
import { makeGuide, makeSeeker } from "./fixtures";

const PHONE_DIGITS = "9876543210";
const viewerRef: { current: unknown } = { current: null };
vi.mock("@/server/viewer", async (orig) => {
  const real = await orig<typeof import("@/server/viewer")>();
  return { ...real, getViewer: async () => viewerRef.current, requireViewer: async () => viewerRef.current };
});
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Error(`REDIRECT:${to}`); } }));

beforeAll(async () => {
  await db().delete(users);
});

async function connectedPair() {
  const seeker = await makeSeeker();
  const guide = await makeGuide();
  const [run] = await db().insert(matchRuns).values({ seekerId: seeker.user.id, inputHash: randomUUID(), status: "done" }).returning();
  const [m] = await db().insert(matches).values({ runId: run!.id, seekerId: seeker.user.id, guideId: guide.user.id, rank: 1, score: 0.9, explanation: "A fit", status: "final" }).returning();
  const r = await createRequest({ seekerId: seeker.user.id, matchId: m!.id, note: "Hello there" });
  if (!r.ok) throw new Error("x");
  await processJobs({ maxMs: 20_000 });
  const mail = (await db().select().from(devOutbox).where(eq(devOutbox.to, guide.user.email)).orderBy(desc(devOutbox.createdAt)))[0]!;
  await decide(/\/review\/([A-Za-z0-9_-]{43})/.exec(mail.text)![1]!, "approve");
  await submitRating({ seekerId: seeker.user.id, connectionId: r.requestId, score: 5, review: "Very helpful indeed" });
  await processJobs({ maxMs: 20_000 }); // embeddings
  return { seeker, guide, requestId: r.requestId };
}

describe("data export", () => {
  it("contains the user's own data and never a phone number or someone else's private data", async () => {
    const p = await connectedPair();

    const guideExport = await buildExport(p.guide.user.id);
    const json = JSON.stringify(guideExport);
    expect(guideExport!.account).toMatchObject({ email: p.guide.user.email, role: "guide" });
    expect(guideExport!.phone).toMatchObject({ onFile: true, endsWith: "3210" });
    expect(json).not.toContain(PHONE_DIGITS);
    expect(json).not.toContain(p.seeker.user.email); // the counterpart's email is never exported
    expect(json).not.toContain("Very helpful indeed"); // a Guide never sees individual reviews, not even in an export
    expect(guideExport!.ratingsReceived).toEqual({ count: 1, average: null, needed: 2 });
    expect(guideExport!.requests[0]).toMatchObject({ direction: "received", with: "Seeker · Career Stagnation", status: "approved" });
    expect(json).not.toContain("Hello there"); // the Seeker's note to the Guide stays with the Seeker's data

    const seekerExport = await buildExport(p.seeker.user.id);
    expect(seekerExport!.ratingsGiven[0]).toMatchObject({ score: 5, review: "Very helpful indeed", guide: p.guide.form.jobTitle });
    expect(seekerExport!.requests[0]).toMatchObject({ direction: "sent", note: "Hello there" });
    expect(seekerExport!.matches).toHaveLength(1);
    expect(JSON.stringify(seekerExport)).not.toContain(PHONE_DIGITS);
    expect(JSON.stringify(seekerExport)).not.toContain(p.guide.user.email);
  });

  it("the route is a POST that returns an attachment, requires sign-in, is audited and rate-limited", async () => {
    const p = await connectedPair();
    const { POST } = await import("@/app/api/account/export/route");
    const call = () => POST(new Request("http://localhost/api/account/export", { method: "POST" }));

    viewerRef.current = null;
    expect((await call()).status).toBe(401);

    viewerRef.current = { id: p.seeker.user.id };
    await db().delete(rateLimits);
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toMatch(/attachment; filename="connect-export-\d{4}-\d{2}-\d{2}\.json"/);
    expect(res.headers.get("cache-control")).toMatch(/no-store/);
    expect((await res.json()).account.email).toBe(p.seeker.user.email);
    expect((await db().select().from(auditLog).where(eq(auditLog.action, "data.exported"))).length).toBeGreaterThan(0);

    for (let i = 0; i < 4; i++) await call();
    expect((await call()).status).toBe(429);
    const cross = await POST(new Request("http://localhost/api/account/export", { method: "POST", headers: { origin: "https://evil.example" } }));
    expect(cross.status).toBe(403);
    viewerRef.current = null;
  });
});

describe("account deletion", () => {
  it("removes the vault entry, embeddings and every row that references the user", async () => {
    const p = await connectedPair();
    const guideId = p.guide.user.id;
    expect((await db().select().from(phoneVault).where(eq(phoneVault.guideId, guideId))).length).toBe(1);
    expect((await db().select().from(profileEmbeddings).where(eq(profileEmbeddings.userId, guideId))).length).toBe(1);
    await db().insert(sessions).values({ userId: guideId, token: randomUUID(), expiresAt: new Date(Date.now() + 1e9) });
    const poolBefore = (await db().select().from(counters).where(eq(counters.name, "guide_pool_version")))[0]!.value;

    expect(await deleteAccount(guideId)).toBe(true);
    expect(await deleteAccount(guideId)).toBe(false); // already gone

    expect(await db().select().from(phoneVault).where(eq(phoneVault.guideId, guideId))).toHaveLength(0);
    expect(await db().select().from(profileEmbeddings).where(eq(profileEmbeddings.userId, guideId))).toHaveLength(0);
    expect(await db().select().from(users).where(eq(users.id, guideId))).toHaveLength(0);

    // Generic check: no foreign-key column anywhere still points at the deleted user.
    const fks = (await db().execute(sql`
      select c.conrelid::regclass::text as tbl, a.attname as col
      from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
      where c.contype = 'f' and c.confrelid = 'users'::regclass`)) as unknown as { rows: { tbl: string; col: string }[] };
    expect(fks.rows.length).toBeGreaterThan(15);
    for (const { tbl, col } of fks.rows) {
      const res = (await db().execute(sql`select count(*)::int as n from ${sql.raw(tbl)} where ${sql.raw(`"${col}"`)} = ${guideId}`)) as unknown as { rows: { n: number }[] };
      expect(res.rows[0]!.n, `${tbl}.${col}`).toBe(0);
    }

    // The audit log keeps an anonymous record only.
    const [entry] = await db().select().from(auditLog).where(and(eq(auditLog.action, "user.deleted"), eq(auditLog.subjectId, guideId)));
    expect(entry).toMatchObject({ actorId: null, subjectId: guideId, metadata: { role: "guide" } });
    expect(JSON.stringify(entry)).not.toContain(p.guide.user.email);

    // The counterpart's account survives, and cached matches are invalidated.
    expect((await db().select().from(users).where(eq(users.id, p.seeker.user.id))).length).toBe(1);
    expect((await db().select().from(connectionRequests).where(eq(connectionRequests.id, p.requestId))).length).toBe(0);
    expect((await db().select().from(counters).where(eq(counters.name, "guide_pool_version")))[0]!.value).toBeGreaterThan(poolBefore);
  });

  it("deleting a seeker removes their ratings and requests but leaves the guide intact", async () => {
    const p = await connectedPair();
    expect(await deleteAccount(p.seeker.user.id)).toBe(true);
    expect((await db().select().from(ratings).where(eq(ratings.guideId, p.guide.user.id))).length).toBe(0);
    expect((await db().select().from(users).where(eq(users.id, p.guide.user.id))).length).toBe(1);
    expect((await db().select().from(phoneVault).where(eq(phoneVault.guideId, p.guide.user.id))).length).toBe(1);
  });

  it("the action needs the typed confirmation and then redirects", async () => {
    const { deleteAccountAction } = await import("@/server/actions/account");
    const p = await connectedPair();
    viewerRef.current = { id: p.seeker.user.id };
    const bad = new FormData();
    bad.set("confirm", "delete me");
    expect(await deleteAccountAction({}, bad)).toEqual({ error: "Type DELETE to confirm." });
    expect((await db().select().from(users).where(eq(users.id, p.seeker.user.id))).length).toBe(1);

    const ok = new FormData();
    ok.set("confirm", "DELETE");
    await expect(deleteAccountAction({}, ok)).rejects.toThrow("REDIRECT:/?deleted=1");
    expect((await db().select().from(users).where(eq(users.id, p.seeker.user.id))).length).toBe(0);
    viewerRef.current = null;
  });
});
