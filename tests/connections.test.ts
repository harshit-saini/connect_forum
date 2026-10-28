import { and, desc, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { auditLog, blocks, connectionRequests, devOutbox, guideProfiles, jobs, matchRuns, matches, unlocks, users } from "@/server/db/schema";
import { createRequest, decide, expireRequests, loadReview } from "@/server/connections/service";
import { processJobs } from "@/server/jobs/worker";
import { csrfFor, generateToken, hashToken, looksLikeToken, verifyCsrf } from "@/server/tokens";
import { makeGuide, makeSeeker } from "./fixtures";

beforeAll(async () => {
  await db().delete(users);
  await db().delete(jobs); // a stale backlog would crowd the worker's batch
});

/** A seeker, a guide and a match row linking them (as a finished run would). */
async function pair(opts: { mutateGuide?: Parameters<typeof makeGuide>[0] } = {}) {
  const seeker = await makeSeeker();
  const guide = await makeGuide(opts.mutateGuide);
  const [run] = await db().insert(matchRuns).values({ seekerId: seeker.user.id, inputHash: "x", status: "done" }).returning();
  const [match] = await db().insert(matches).values({ runId: run!.id, seekerId: seeker.user.id, guideId: guide.user.id, rank: 1, score: 0.9, explanation: "fits", status: "final" }).returning();
  return { seeker, guide, match: match! };
}

async function emailsTo(address: string) {
  return db().select().from(devOutbox).where(eq(devOutbox.to, address.toLowerCase())).orderBy(desc(devOutbox.createdAt));
}

/** Creates a request and returns the raw token the Guide received by e-mail. */
async function requestWithToken(p: Awaited<ReturnType<typeof pair>>, note?: string) {
  const r = await createRequest({ seekerId: p.seeker.user.id, matchId: p.match.id, note });
  if (!r.ok) throw new Error(JSON.stringify(r));
  await processJobs({ maxMs: 20_000 });
  const mail = (await emailsTo(p.guide.user.email))[0]!;
  const token = /\/review\/([A-Za-z0-9_-]{43})/.exec(mail.text)![1]!;
  return { requestId: r.requestId, token, mail };
}

describe("tokens", () => {
  it("are 256-bit URL-safe strings hashed with SHA-256, and csrf is bound to the token", () => {
    const t = generateToken();
    expect(looksLikeToken(t)).toBe(true);
    expect(hashToken(t)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(t)).not.toContain(t);
    expect(generateToken()).not.toBe(t);
    const h = hashToken(t);
    expect(verifyCsrf(h, csrfFor(h))).toBe(true);
    expect(verifyCsrf(h, csrfFor(hashToken(generateToken())))).toBe(false);
    expect(verifyCsrf(h, "")).toBe(false);
  });
});

describe("creating a request", () => {
  it("stores only a token hash, seals the token in the job, and e-mails the guide an anonymous summary", async () => {
    const p = await pair();
    const r = await createRequest({ seekerId: p.seeker.user.id, matchId: p.match.id, note: "I would love your view on moving into product." });
    if (!r.ok) throw new Error("expected ok");

    const [row] = await db().select().from(connectionRequests).where(eq(connectionRequests.id, r.requestId));
    expect(row!.status).toBe("pending");
    expect(row!.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(row!.expiresAt.getTime()).toBeGreaterThan(Date.now() + 6.9 * 86_400_000);
    expect(row!.expiresAt.getTime()).toBeLessThan(Date.now() + 7.1 * 86_400_000);

    const [job] = await db().select().from(jobs).where(eq(jobs.idempotencyKey, `req_email:${r.requestId}`));
    // Sealed (AES-GCM parts), not a raw token or link.
    expect(Object.keys(job!.payload).sort()).toEqual(["kind", "requestId", "sealedToken", "userId"]);
    expect(Object.keys(JSON.parse(String(job!.payload.sealedToken))).sort()).toEqual(["c", "i", "t", "v"]);
    expect(JSON.stringify(job!.payload)).not.toContain("/review/");

    await processJobs({ maxMs: 20_000 });
    const [mail] = await emailsTo(p.guide.user.email);
    const token = /\/review\/([A-Za-z0-9_-]{43})/.exec(mail!.text)![1]!;
    expect(hashToken(token)).toBe(row!.tokenHash);
    expect(mail!.text).toMatch(/Category: Career Stagnation/);
    expect(mail!.text).toContain(p.seeker.form.query);
    for (const secret of [p.seeker.user.email, "9876543210"]) expect(mail!.text).not.toContain(secret);

    // The raw token no longer exists anywhere in the job row once the e-mail is out.
    const [after] = await db().select().from(jobs).where(eq(jobs.id, job!.id));
    expect(JSON.stringify(after!.payload)).not.toContain("sealedToken");
    const [{ payload }] = await db().select({ payload: jobs.payload }).from(jobs).where(eq(jobs.id, job!.id));
    expect(JSON.stringify(payload)).not.toContain(token);
  });

  it("rejects notes with contact details and enforces ownership, duplicates and the pending cap", async () => {
    const p = await pair();
    expect(await createRequest({ seekerId: p.seeker.user.id, matchId: p.match.id, note: "call me on 98765 43210" })).toMatchObject({ ok: false, code: "note" });
    const other = await makeSeeker();
    expect(await createRequest({ seekerId: other.user.id, matchId: p.match.id })).toMatchObject({ ok: false, code: "not_found" });

    expect((await createRequest({ seekerId: p.seeker.user.id, matchId: p.match.id })).ok).toBe(true);
    expect(await createRequest({ seekerId: p.seeker.user.id, matchId: p.match.id })).toMatchObject({ ok: false, code: "duplicate" });

    // cap of 3 pending (MAX_PENDING_REQUESTS default)
    const s = await makeSeeker();
    for (let i = 0; i < 3; i++) {
      const g = await makeGuide();
      const [run] = await db().insert(matchRuns).values({ seekerId: s.user.id, inputHash: `c${i}`, status: "done" }).returning();
      const [m] = await db().insert(matches).values({ runId: run!.id, seekerId: s.user.id, guideId: g.user.id, rank: 1, score: 0.5, status: "final" }).returning();
      expect((await createRequest({ seekerId: s.user.id, matchId: m!.id })).ok).toBe(true);
    }
    const g4 = await makeGuide();
    const [run4] = await db().insert(matchRuns).values({ seekerId: s.user.id, inputHash: "c4", status: "done" }).returning();
    const [m4] = await db().insert(matches).values({ runId: run4!.id, seekerId: s.user.id, guideId: g4.user.id, rank: 1, score: 0.5, status: "final" }).returning();
    expect(await createRequest({ seekerId: s.user.id, matchId: m4!.id })).toMatchObject({ ok: false, code: "limit" });
  });

  it("refuses unavailable guides (paused, suspended, blocked)", async () => {
    const paused = await pair();
    await db().update(guideProfiles).set({ matchingPaused: true }).where(eq(guideProfiles.userId, paused.guide.user.id));
    expect(await createRequest({ seekerId: paused.seeker.user.id, matchId: paused.match.id })).toMatchObject({ ok: false, code: "unavailable" });

    const suspended = await pair();
    await db().update(users).set({ suspendedAt: new Date() }).where(eq(users.id, suspended.guide.user.id));
    expect(await createRequest({ seekerId: suspended.seeker.user.id, matchId: suspended.match.id })).toMatchObject({ ok: false, code: "unavailable" });

    const blocked = await pair();
    await db().insert(blocks).values({ blockerId: blocked.guide.user.id, blockedId: blocked.seeker.user.id });
    expect(await createRequest({ seekerId: blocked.seeker.user.id, matchId: blocked.match.id })).toMatchObject({ ok: false, code: "unavailable" });
  });
});

describe("reviewing and deciding", () => {
  it("opening the link (GET) never consumes it, and shows only anonymous details", async () => {
    const p = await pair();
    const { token, requestId } = await requestWithToken(p, "Hello, I admire your path.");
    for (let i = 0; i < 3; i++) {
      const review = await loadReview(token);
      expect(review.state).toBe("open");
    }
    const review = await loadReview(token);
    if (review.state !== "open") throw new Error("expected open");
    expect(JSON.stringify(review)).not.toMatch(/@example\.com|9876543210|Acme/);
    expect(review.note).toBe("Hello, I admire your path.");
    const [r] = await db().select().from(connectionRequests).where(eq(connectionRequests.id, requestId));
    expect(r!.status).toBe("pending");
    expect(r!.tokenUsedAt).toBeNull();
    expect(await loadReview("not-a-token")).toEqual({ state: "invalid" });
    expect(await loadReview(generateToken())).toEqual({ state: "invalid" });
  });

  it("approving creates one unlock, audit entries, and an approved e-mail without the number", async () => {
    const p = await pair();
    const { token, requestId } = await requestWithToken(p);

    expect(await decide(token, "approve")).toEqual({ ok: true, outcome: "approved" });
    const [r] = await db().select().from(connectionRequests).where(eq(connectionRequests.id, requestId));
    expect(r).toMatchObject({ status: "approved" });
    expect(r!.approvedAt).toBeInstanceOf(Date);
    expect(r!.tokenUsedAt).toBeInstanceOf(Date);

    const ul = await db().select().from(unlocks).where(and(eq(unlocks.seekerId, p.seeker.user.id), eq(unlocks.guideId, p.guide.user.id)));
    expect(ul).toHaveLength(1);
    const actions = (await db().select().from(auditLog).where(eq(auditLog.subjectId, requestId))).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(["connection.requested", "connection.approved"]));
    expect((await db().select().from(auditLog).where(eq(auditLog.subjectId, ul[0]!.id))).map((a) => a.action)).toEqual(["unlock.created"]);

    await processJobs({ maxMs: 20_000 });
    const [mail] = await emailsTo(p.seeker.user.email).then((m) => m.filter((x) => x.subject.includes("approved")));
    expect(mail).toBeDefined();
    expect(mail!.text.replace(/https?:\/\/\S+/g, "")).not.toMatch(/\+?\d[\d\s-]{8,}\d/); // no phone number anywhere
    expect(mail!.text).not.toContain("98765");
    expect(mail!.text).toContain(`/seeker/connections/${requestId}`);

    // single use
    expect(await decide(token, "approve")).toMatchObject({ ok: false, code: "answered" });
    expect(await decide(token, "decline")).toMatchObject({ ok: false, code: "answered" });
  });

  it("declining sends a generic e-mail that does not name the guide", async () => {
    const p = await pair();
    const { token } = await requestWithToken(p);
    expect(await decide(token, "decline")).toEqual({ ok: true, outcome: "declined" });
    expect(await db().select().from(unlocks).where(eq(unlocks.seekerId, p.seeker.user.id))).toHaveLength(0);
    await processJobs({ maxMs: 20_000 });
    const mail = (await emailsTo(p.seeker.user.email)).find((m) => m.subject.includes("update on your request"))!;
    expect(mail.text).toMatch(/other matches/i);
    expect(mail.text).not.toContain(p.guide.form.jobTitle);
  });

  it("lets exactly one of several simultaneous decisions win", async () => {
    const p = await pair();
    const { token } = await requestWithToken(p);
    const results = await Promise.all([decide(token, "approve"), decide(token, "approve"), decide(token, "decline"), decide(token, "approve")]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect((await db().select().from(unlocks).where(eq(unlocks.seekerId, p.seeker.user.id))).length).toBeLessThanOrEqual(1);
  });

  it("rejects expired links and expires pending requests with a notification", async () => {
    const p = await pair();
    const { token, requestId } = await requestWithToken(p);
    await db().update(connectionRequests).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(connectionRequests.id, requestId));
    expect(await loadReview(token)).toEqual({ state: "expired" });
    expect(await decide(token, "approve")).toMatchObject({ ok: false, code: "expired" });
    expect(await expireRequests()).toBeGreaterThanOrEqual(1);
    expect(await expireRequests()).toBe(0); // idempotent
    const [r] = await db().select().from(connectionRequests).where(eq(connectionRequests.id, requestId));
    expect(r!.status).toBe("expired");
    await processJobs({ maxMs: 20_000 });
    expect((await emailsTo(p.seeker.user.email)).some((m) => m.subject.includes("wasn't answered in time"))).toBe(true);
  });

  it("will not approve for a suspended guide, but has no monthly limit for an active one", async () => {
    const s = await pair();
    const { token: t1 } = await requestWithToken(s);
    await db().update(users).set({ suspendedAt: new Date() }).where(eq(users.id, s.guide.user.id));
    expect(await decide(t1, "approve")).toMatchObject({ ok: false, code: "unavailable" });

    const c = await pair();
    const { token: t2 } = await requestWithToken(c);
    for (let i = 0; i < 6; i++) {
      const other = await makeSeeker();
      await db().insert(connectionRequests).values({ seekerId: other.user.id, guideId: c.guide.user.id, status: "approved", approvedAt: new Date(), tokenHash: generateToken(), expiresAt: new Date(Date.now() + 1e9) });
    }
    expect(await decide(t2, "approve")).toEqual({ ok: true, outcome: "approved" }); // however many were approved this month
  });
});
