import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db/client";
import { auditLog, blocks, connectionRequests, jobs, matchRuns, matches, rateLimits, reports, unlocks, users } from "@/server/db/schema";
import { createRequest, decide } from "@/server/connections/service";
import { revealNumber } from "@/server/connections/reveal";
import { findCandidates, loadSeekerContext } from "@/server/matching/candidates";
import { processJobs } from "@/server/jobs/worker";
import { applySafetyAction, resolveSeekerTarget } from "@/server/safety/service";
import { devOutbox } from "@/server/db/schema";
import { desc } from "drizzle-orm";
import { makeGuide, makeSeeker } from "./fixtures";

const PHONE = "+919876543210";

const viewerRef: { current: unknown } = { current: null };
vi.mock("@/server/viewer", () => ({ getViewer: async () => viewerRef.current }));

beforeAll(async () => {
  await db().delete(users);
  await db().delete(jobs);
});
afterEach(() => {
  viewerRef.current = null;
  vi.restoreAllMocks();
});

async function approvedPair() {
  const seeker = await makeSeeker();
  const guide = await makeGuide();
  const [run] = await db().insert(matchRuns).values({ seekerId: seeker.user.id, inputHash: randomUUID(), status: "done" }).returning();
  const [m] = await db().insert(matches).values({ runId: run!.id, seekerId: seeker.user.id, guideId: guide.user.id, rank: 1, score: 0.9, status: "final" }).returning();
  const r = await createRequest({ seekerId: seeker.user.id, matchId: m!.id });
  if (!r.ok) throw new Error("request failed");
  await processJobs({ maxMs: 20_000 });
  const mail = (await db().select().from(devOutbox).where(eq(devOutbox.to, guide.user.email)).orderBy(desc(devOutbox.createdAt)))[0]!;
  const token = /\/review\/([A-Za-z0-9_-]{43})/.exec(mail.text)![1]!;
  expect(await decide(token, "approve")).toEqual({ ok: true, outcome: "approved" });
  return { seeker, guide, requestId: r.requestId, matchId: m!.id };
}

describe("revealNumber", () => {
  it("returns the number to the approved seeker, and audits it", async () => {
    const p = await approvedPair();
    const res = await revealNumber({ seekerId: p.seeker.user.id, connectionId: p.requestId });
    expect(res).toEqual({ ok: true, phone: PHONE });
    const rows = await db().select().from(auditLog).where(and(eq(auditLog.action, "phone.revealed"), eq(auditLog.subjectId, p.requestId)));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actorId: p.seeker.user.id, targetId: p.guide.user.id });
    expect(JSON.stringify(rows)).not.toContain("9876543210");
  });

  it("never writes the number to logs", async () => {
    process.env.LOG_IN_TESTS = "1";
    const spies = [vi.spyOn(console, "log"), vi.spyOn(console, "info"), vi.spyOn(console, "warn"), vi.spyOn(console, "error")];
    const p = await approvedPair();
    await revealNumber({ seekerId: p.seeker.user.id, connectionId: p.requestId });
    delete process.env.LOG_IN_TESTS;
    expect(JSON.stringify(spies.flatMap((s) => s.mock.calls))).not.toMatch(/9876543210|98765/);
  });

  it("denies, and audits the denial, for every way access can be wrong", async () => {
    const denied = async (seekerId: string, connectionId: string) => revealNumber({ seekerId, connectionId });

    // someone else's connection, and a made-up one
    const a = await approvedPair();
    const stranger = await makeSeeker();
    expect(await denied(stranger.user.id, a.requestId)).toEqual({ ok: false, code: "not_found" });
    expect(await denied(a.seeker.user.id, randomUUID())).toEqual({ ok: false, code: "not_found" });

    // pending (not yet approved)
    const seeker = await makeSeeker();
    const guide = await makeGuide();
    const [run] = await db().insert(matchRuns).values({ seekerId: seeker.user.id, inputHash: randomUUID(), status: "done" }).returning();
    const [m] = await db().insert(matches).values({ runId: run!.id, seekerId: seeker.user.id, guideId: guide.user.id, rank: 1, score: 0.5, status: "final" }).returning();
    const pending = await createRequest({ seekerId: seeker.user.id, matchId: m!.id });
    if (!pending.ok) throw new Error("x");
    expect(await denied(seeker.user.id, pending.requestId)).toEqual({ ok: false, code: "not_approved" });

    // approved but the unlock row is gone
    const b = await approvedPair();
    await db().delete(unlocks).where(eq(unlocks.connectionRequestId, b.requestId));
    expect(await denied(b.seeker.user.id, b.requestId)).toEqual({ ok: false, code: "not_approved" });

    // suspended guide
    const c = await approvedPair();
    await db().update(users).set({ suspendedAt: new Date() }).where(eq(users.id, c.guide.user.id));
    expect(await denied(c.seeker.user.id, c.requestId)).toEqual({ ok: false, code: "unavailable" });

    // blocked by either side
    const d = await approvedPair();
    await db().insert(blocks).values({ blockerId: d.guide.user.id, blockedId: d.seeker.user.id });
    expect(await denied(d.seeker.user.id, d.requestId)).toEqual({ ok: false, code: "unavailable" });
    const e = await approvedPair();
    await db().insert(blocks).values({ blockerId: e.seeker.user.id, blockedId: e.guide.user.id });
    expect(await denied(e.seeker.user.id, e.requestId)).toEqual({ ok: false, code: "unavailable" });

    const denials = await db().select().from(auditLog).where(eq(auditLog.action, "phone.reveal_denied"));
    expect(denials.length).toBeGreaterThanOrEqual(7);
    expect(JSON.stringify(denials)).not.toContain("9876543210");
  });
});

describe("POST /api/connections/:id/reveal", () => {
  async function call(connectionId: string) {
    const { POST } = await import("@/app/api/connections/[id]/reveal/route");
    return POST(new Request("http://localhost/x", { method: "POST" }), { params: Promise.resolve({ id: connectionId }) });
  }
  const asSeeker = (u: { id: string }) => (viewerRef.current = { id: u.id, role: "seeker", suspended: false, profileCompleted: true });

  it("is no-store, requires a signed-in seeker, and returns the number to the owner", async () => {
    const p = await approvedPair();
    const anon = await call(p.requestId);
    expect(anon.status).toBe(401);
    expect(anon.headers.get("cache-control")).toMatch(/no-store/);

    asSeeker(p.seeker.user);
    const ok = await call(p.requestId);
    expect(ok.status).toBe(200);
    expect(ok.headers.get("cache-control")).toMatch(/no-store/);
    expect(ok.headers.get("pragma")).toBe("no-cache");
    expect(await ok.json()).toMatchObject({ phone: PHONE });

    asSeeker((await makeSeeker()).user);
    expect((await call(p.requestId)).status).toBe(404);
    expect((await call("not-a-uuid")).status).toBe(404);
  });

  it("rate-limits repeated reveals", async () => {
    const p = await approvedPair();
    asSeeker(p.seeker.user);
    await db().delete(rateLimits);
    const statuses: number[] = [];
    for (let i = 0; i < 8; i++) statuses.push((await call(p.requestId)).status);
    expect(statuses.slice(0, 6)).toEqual([200, 200, 200, 200, 200, 200]); // 6 per connection per hour
    expect(statuses.slice(6)).toEqual([429, 429]);
    const limited = await call(p.requestId);
    expect(limited.headers.get("retry-after")).toBeTruthy();
    expect(limited.headers.get("cache-control")).toMatch(/no-store/);
  });
});

describe("report and block", () => {
  it("resolves targets only for the owning seeker", async () => {
    const p = await approvedPair();
    const other = await makeSeeker();
    expect(await resolveSeekerTarget(p.seeker.user.id, { kind: "match", id: p.matchId })).toBe(p.guide.user.id);
    expect(await resolveSeekerTarget(p.seeker.user.id, { kind: "connection", id: p.requestId })).toBe(p.guide.user.id);
    expect(await resolveSeekerTarget(other.user.id, { kind: "match", id: p.matchId })).toBeNull();
    expect(await resolveSeekerTarget(other.user.id, { kind: "connection", id: p.requestId })).toBeNull();
  });

  it("a report is recorded, audited, and removes the pair from matching", async () => {
    const seeker = await makeSeeker();
    const guide = await makeGuide();
    const ctx = (await loadSeekerContext(seeker.user.id, true))!;
    expect((await findCandidates(ctx)).map((c) => c.guideId)).toContain(guide.user.id);

    expect(await applySafetyAction({ actorId: seeker.user.id, otherId: guide.user.id, input: { action: "report" } })).toMatchObject({ ok: false }); // needs a reason
    expect(await applySafetyAction({ actorId: seeker.user.id, otherId: guide.user.id, input: { action: "report", reason: "harassment", details: "pushy" } })).toEqual({ ok: true });
    const [rep] = await db().select().from(reports).where(eq(reports.reporterId, seeker.user.id));
    expect(rep).toMatchObject({ reportedId: guide.user.id, reason: "harassment", status: "open" });
    expect((await findCandidates(ctx)).map((c) => c.guideId)).not.toContain(guide.user.id);
    expect((await db().select().from(auditLog).where(eq(auditLog.action, "report.created"))).length).toBeGreaterThan(0);
  });

  it("a block cancels pending requests, stops new ones, and ends reveal, from either side", async () => {
    const p = await approvedPair();
    // a second, still-pending request between a different pair
    const s2 = await makeSeeker();
    const g2 = await makeGuide();
    const [run] = await db().insert(matchRuns).values({ seekerId: s2.user.id, inputHash: randomUUID(), status: "done" }).returning();
    const [m2] = await db().insert(matches).values({ runId: run!.id, seekerId: s2.user.id, guideId: g2.user.id, rank: 1, score: 0.5, status: "final" }).returning();
    const pending = await createRequest({ seekerId: s2.user.id, matchId: m2!.id });
    if (!pending.ok) throw new Error("x");

    // the Guide blocks the first Seeker: reveal stops
    expect(await applySafetyAction({ actorId: p.guide.user.id, otherId: p.seeker.user.id, input: { action: "block" } })).toEqual({ ok: true });
    expect(await revealNumber({ seekerId: p.seeker.user.id, connectionId: p.requestId })).toEqual({ ok: false, code: "unavailable" });

    // the second Seeker blocks their pending Guide: the request is cancelled
    expect(await applySafetyAction({ actorId: s2.user.id, otherId: g2.user.id, input: { action: "block" } })).toEqual({ ok: true });
    const [req] = await db().select().from(connectionRequests).where(eq(connectionRequests.id, pending.requestId));
    expect(req!.status).toBe("cancelled");
    expect(await createRequest({ seekerId: s2.user.id, matchId: m2!.id })).toMatchObject({ ok: false, code: "unavailable" });
    expect((await findCandidates((await loadSeekerContext(s2.user.id, true))!)).map((c) => c.guideId)).not.toContain(g2.user.id);

    // idempotent, and you cannot target yourself
    expect(await applySafetyAction({ actorId: s2.user.id, otherId: g2.user.id, input: { action: "block" } })).toEqual({ ok: true });
    expect(await applySafetyAction({ actorId: s2.user.id, otherId: s2.user.id, input: { action: "block" } })).toMatchObject({ ok: false });
  });
});
