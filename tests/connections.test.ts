import { randomUUID } from "node:crypto";
import { and, count, desc, eq, or } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db/client";
import { auditLog, blocks, connectionRequests, devOutbox, guideProfiles, jobs, reports, unlocks, users } from "@/server/db/schema";
import { closeLegacyPending, createRequest, listSeekerConnections } from "@/server/connections/service";
import { queue } from "@/server/jobs";
import { connectedPair, drainJobs, makeGuide, makeMatch, makePair, makeSeeker, PHONE, setShareEmail } from "./fixtures";

beforeAll(async () => {
  await db().delete(users);
  await db().delete(jobs); // a stale backlog would crowd the worker's batch
});
afterEach(() => vi.restoreAllMocks());

async function emailsTo(address: string) {
  return db().select().from(devOutbox).where(eq(devOutbox.to, address.toLowerCase())).orderBy(desc(devOutbox.createdAt));
}
const jobsFor = (requestId: string) => db().select().from(jobs).where(eq(jobs.idempotencyKey, `guide_details:${requestId}`));

describe("connecting", () => {
  it("records an approved connection, the unlock and the audit entries in one go", async () => {
    const p = await makePair();
    const r = await createRequest({ seekerId: p.seeker.user.id, matchId: p.match.id, note: "I would love your view on moving into product." });
    if (!r.ok) throw new Error("expected ok");

    const [row] = await db().select().from(connectionRequests).where(eq(connectionRequests.id, r.requestId));
    expect(row).toMatchObject({ status: "approved", seekerId: p.seeker.user.id, guideId: p.guide.user.id, matchId: p.match.id, note: "I would love your view on moving into product.", tokenHash: null, expiresAt: null });
    expect(row!.approvedAt).toBeInstanceOf(Date);
    expect(Math.abs(row!.approvedAt!.getTime() - Date.now())).toBeLessThan(60_000);

    const ul = await db().select().from(unlocks).where(and(eq(unlocks.seekerId, p.seeker.user.id), eq(unlocks.guideId, p.guide.user.id)));
    expect(ul).toHaveLength(1);
    expect(ul[0]!.connectionRequestId).toBe(r.requestId);

    const actions = (await db().select().from(auditLog).where(eq(auditLog.subjectId, r.requestId))).map((a) => a.action);
    expect(actions.sort()).toEqual(["connection.approved", "connection.requested"]);
    expect((await db().select().from(auditLog).where(eq(auditLog.subjectId, ul[0]!.id))).map((a) => a.action)).toEqual(["unlock.created"]);

    // Both e-mails and the rating reminder are queued with the connection, ids only.
    const queued = await db().select().from(jobs).where(or(eq(jobs.idempotencyKey, `guide_details:${r.requestId}`), eq(jobs.idempotencyKey, `guide_notified:${r.requestId}`), eq(jobs.idempotencyKey, `rating_reminder:${r.requestId}`)));
    expect(queued.map((j) => j.type).sort()).toEqual(["rating_reminder", "send_email", "send_email"]);
    const reminder = queued.find((j) => j.type === "rating_reminder")!;
    expect(reminder.runAt.getTime()).toBeGreaterThan(Date.now() + 2.9 * 86_400_000); // RATING_DELAY_DAYS defaults to 3
  });

  it("leaves nothing behind when queueing fails part-way (atomic)", async () => {
    const p = await makePair();
    const q = queue();
    const real = q.enqueue.bind(q);
    let calls = 0;
    vi.spyOn(q, "enqueue").mockImplementation(async (...args) => {
      if (++calls === 2) throw new Error("queue down");
      return real(...args);
    });
    await expect(createRequest({ seekerId: p.seeker.user.id, matchId: p.match.id })).rejects.toThrow("queue down");
    expect(await db().select().from(connectionRequests).where(eq(connectionRequests.seekerId, p.seeker.user.id))).toHaveLength(0);
    expect(await db().select().from(unlocks).where(eq(unlocks.seekerId, p.seeker.user.id))).toHaveLength(0);
    expect(await db().select().from(auditLog).where(eq(auditLog.actorId, p.seeker.user.id))).toHaveLength(0);
    vi.restoreAllMocks();
    expect((await createRequest({ seekerId: p.seeker.user.id, matchId: p.match.id })).ok).toBe(true); // a retry works
  });

  it("rejects notes with contact details and enforces ownership and duplicates", async () => {
    const p = await makePair();
    expect(await createRequest({ seekerId: p.seeker.user.id, matchId: p.match.id, note: "call me on 98765 43210" })).toMatchObject({ ok: false, code: "note" });
    expect(await db().select().from(connectionRequests).where(eq(connectionRequests.seekerId, p.seeker.user.id))).toHaveLength(0);
    const other = await makeSeeker();
    expect(await createRequest({ seekerId: other.user.id, matchId: p.match.id })).toMatchObject({ ok: false, code: "not_found" });

    expect((await createRequest({ seekerId: p.seeker.user.id, matchId: p.match.id })).ok).toBe(true);
    expect(await createRequest({ seekerId: p.seeker.user.id, matchId: p.match.id })).toMatchObject({ ok: false, code: "duplicate" });
  });

  it("has no pending cap: a Seeker can connect with any number of Guides", async () => {
    const s = await makeSeeker();
    for (let i = 0; i < 5; i++) {
      const g = await makeGuide();
      const m = await makeMatch(s.user.id, g.user.id);
      expect((await createRequest({ seekerId: s.user.id, matchId: m.id })).ok, `connection ${i}`).toBe(true);
    }
    expect((await listSeekerConnections(s.user.id)).filter((c) => c.status === "approved")).toHaveLength(5);
  });

  it("creates exactly one connection and one e-mail pair for simultaneous calls (double click, two tabs)", async () => {
    const p = await makePair();
    const results = await Promise.all(Array.from({ length: 6 }, () => createRequest({ seekerId: p.seeker.user.id, matchId: p.match.id })));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok).every((r) => !r.ok && r.code === "duplicate")).toBe(true);

    const rows = await db().select().from(connectionRequests).where(eq(connectionRequests.seekerId, p.seeker.user.id));
    expect(rows).toHaveLength(1);
    expect(await db().select().from(unlocks).where(eq(unlocks.seekerId, p.seeker.user.id))).toHaveLength(1);
    const id = rows[0]!.id;
    expect(await db().select().from(jobs).where(eq(jobs.idempotencyKey, `guide_details:${id}`))).toHaveLength(1);
    expect(await db().select().from(jobs).where(eq(jobs.idempotencyKey, `guide_notified:${id}`))).toHaveLength(1);

    await drainJobs();
    expect((await emailsTo(p.seeker.user.email)).filter((m) => m.subject === "Your Guide's details")).toHaveLength(1);
    expect((await emailsTo(p.guide.user.email)).filter((m) => m.subject === "A Seeker has been given your details")).toHaveLength(1);
  });

  it("refuses unavailable guides (paused, suspended, deleted, not finished, blocked, reported)", async () => {
    const paused = await makePair();
    await db().update(guideProfiles).set({ matchingPaused: true }).where(eq(guideProfiles.userId, paused.guide.user.id));
    expect(await createRequest({ seekerId: paused.seeker.user.id, matchId: paused.match.id })).toMatchObject({ ok: false, code: "unavailable" });

    const suspended = await makePair();
    await db().update(users).set({ suspendedAt: new Date() }).where(eq(users.id, suspended.guide.user.id));
    expect(await createRequest({ seekerId: suspended.seeker.user.id, matchId: suspended.match.id })).toMatchObject({ ok: false, code: "unavailable" });

    const deleted = await makePair();
    await db().update(users).set({ deletedAt: new Date() }).where(eq(users.id, deleted.guide.user.id));
    expect(await createRequest({ seekerId: deleted.seeker.user.id, matchId: deleted.match.id })).toMatchObject({ ok: false, code: "unavailable" });

    const unfinished = await makePair();
    await db().update(guideProfiles).set({ profileCompletedAt: null }).where(eq(guideProfiles.userId, unfinished.guide.user.id));
    expect(await createRequest({ seekerId: unfinished.seeker.user.id, matchId: unfinished.match.id })).toMatchObject({ ok: false, code: "unavailable" });

    const blockedByGuide = await makePair();
    await db().insert(blocks).values({ blockerId: blockedByGuide.guide.user.id, blockedId: blockedByGuide.seeker.user.id });
    expect(await createRequest({ seekerId: blockedByGuide.seeker.user.id, matchId: blockedByGuide.match.id })).toMatchObject({ ok: false, code: "unavailable" });

    const blockedBySeeker = await makePair();
    await db().insert(blocks).values({ blockerId: blockedBySeeker.seeker.user.id, blockedId: blockedBySeeker.guide.user.id });
    expect(await createRequest({ seekerId: blockedBySeeker.seeker.user.id, matchId: blockedBySeeker.match.id })).toMatchObject({ ok: false, code: "unavailable" });

    const reported = await makePair();
    await db().insert(reports).values({ reporterId: reported.seeker.user.id, reportedId: reported.guide.user.id, reason: "harassment" });
    expect(await createRequest({ seekerId: reported.seeker.user.id, matchId: reported.match.id })).toMatchObject({ ok: false, code: "unavailable" });

    for (const p of [paused, suspended, deleted, unfinished, blockedByGuide, blockedBySeeker, reported]) {
      expect(await db().select().from(connectionRequests).where(eq(connectionRequests.seekerId, p.seeker.user.id))).toHaveLength(0);
      expect(await db().select().from(unlocks).where(eq(unlocks.seekerId, p.seeker.user.id))).toHaveLength(0);
    }
  });
});

describe("the e-mail to the Seeker", () => {
  it("has the Guide's public details, their phone number when one is on file, and their address when they share it", async () => {
    const p = await connectedPair();
    const mail = (await emailsTo(p.seeker.user.email)).find((m) => m.subject === "Your Guide's details")!;
    expect(mail).toBeDefined();
    expect(mail.text).toContain(p.guide.form.jobTitle);
    expect(mail.text).toMatch(/12 years/);
    expect(mail.text).toMatch(/Career Stagnation/);
    expect(mail.text).toContain(p.guide.form.about);
    expect(mail.text).toContain(PHONE);
    expect(mail.text).toContain(`/seeker/connections/${p.requestId}`);
    expect(mail.text).toContain(`Email: ${p.guide.user.email}`); // this Guide ticked "share my email address"
    expect(mail.text).toMatch(/keep their contact details to yourself/);
  });

  it("says plainly that there is no number, and does not include one, when the Guide gave none", async () => {
    const p = await connectedPair({ phone: null });
    const mail = (await emailsTo(p.seeker.user.email)).find((m) => m.subject === "Your Guide's details")!;
    expect(mail).toBeDefined();
    expect(mail.text).toContain(p.guide.form.jobTitle);
    expect(mail.text).toContain("didn't share a phone number");
    expect(mail.text).toContain(`Email: ${p.guide.user.email}`); // still reachable by e-mail
    expect(mail.text).not.toMatch(/can't contact them directly/);
    expect(mail.text.replace(/https?:\/\/\S+/g, "").replace(p.guide.user.email, "")).not.toMatch(/\+?\d[\d\s-]{8,}\d/);
  });

  it("says the Guide can't be contacted directly when they gave neither a number nor an address", async () => {
    const p = await connectedPair({ phone: null, guide: { shareEmail: false } });
    const mail = (await emailsTo(p.seeker.user.email)).find((m) => m.subject === "Your Guide's details")!;
    expect(mail.text).toContain("didn't share a phone number or an email address");
    expect(mail.text).toMatch(/can't contact them directly/);
    expect(mail.text).not.toContain(p.guide.user.email);
    expect(mail.text).not.toMatch(/Email:/);
  });

  it("uses the number on file when the e-mail is sent, not when the Seeker connected", async () => {
    const p = await makePair();
    const r = await createRequest({ seekerId: p.seeker.user.id, matchId: p.match.id });
    if (!r.ok) throw new Error("x");
    const { phoneVault } = await import("@/server/db/schema");
    await db().delete(phoneVault).where(eq(phoneVault.guideId, p.guide.user.id)); // the Guide removed it in between
    await drainJobs();
    const mail = (await emailsTo(p.seeker.user.email)).find((m) => m.subject === "Your Guide's details")!;
    expect(mail.text).not.toContain(PHONE);
    expect(mail.text).toContain("didn't share a phone number");
  });

  it("never puts a phone number or an e-mail address in a job row", async () => {
    const p = await makePair();
    const r = await createRequest({ seekerId: p.seeker.user.id, matchId: p.match.id, note: "Hello" });
    if (!r.ok) throw new Error("x");
    const check = async () => {
      const rows = await db().select().from(jobs).where(or(eq(jobs.idempotencyKey, `guide_details:${r.requestId}`), eq(jobs.idempotencyKey, `guide_notified:${r.requestId}`), eq(jobs.idempotencyKey, `rating_reminder:${r.requestId}`)));
      expect(rows).toHaveLength(3);
      for (const j of rows) {
        const payload = JSON.stringify(j.payload);
        expect(Object.keys(j.payload).every((k) => ["kind", "userId", "requestId", "shares"].includes(k)), payload).toBe(true);
        for (const secret of ["9876543210", "98765", p.guide.user.email, p.seeker.user.email, "@"]) expect(payload).not.toContain(secret);
        expect(`${j.lastError ?? ""}`).not.toContain("9876543210");
      }
    };
    await check(); // queued
    await drainJobs();
    await check(); // and after they have run
    expect((await emailsTo(p.seeker.user.email)).some((m) => m.text.includes(PHONE))).toBe(true);
  });

  it("is not sent when the Guide was suspended, or either side blocked the other, since connecting", async () => {
    const suspended = await makePair();
    const a = await createRequest({ seekerId: suspended.seeker.user.id, matchId: suspended.match.id });
    if (!a.ok) throw new Error("x");
    await db().update(users).set({ suspendedAt: new Date() }).where(eq(users.id, suspended.guide.user.id));

    const blocked = await makePair();
    const b = await createRequest({ seekerId: blocked.seeker.user.id, matchId: blocked.match.id });
    if (!b.ok) throw new Error("x");
    await db().insert(blocks).values({ blockerId: blocked.guide.user.id, blockedId: blocked.seeker.user.id });

    const blockedBySeeker = await makePair();
    const c = await createRequest({ seekerId: blockedBySeeker.seeker.user.id, matchId: blockedBySeeker.match.id });
    if (!c.ok) throw new Error("x");
    await db().insert(blocks).values({ blockerId: blockedBySeeker.seeker.user.id, blockedId: blockedBySeeker.guide.user.id });

    await drainJobs();
    for (const p of [suspended, blocked, blockedBySeeker]) {
      expect(await emailsTo(p.seeker.user.email)).toHaveLength(0);
      expect(await emailsTo(p.guide.user.email)).toHaveLength(0);
    }
  });

  it("is sent once even when the job is run twice", async () => {
    const p = await makePair();
    const r = await createRequest({ seekerId: p.seeker.user.id, matchId: p.match.id });
    if (!r.ok) throw new Error("x");
    await drainJobs();
    await drainJobs();
    expect((await emailsTo(p.seeker.user.email)).filter((m) => m.subject === "Your Guide's details")).toHaveLength(1);
    expect(await jobsFor(r.requestId)).toHaveLength(1);
  });
});

describe("the e-mail to the Guide", () => {
  it("has the Seeker's category, question and e-mail address, but no member ID or phone number", async () => {
    const p = await connectedPair({ note: "I admire your path." });
    const mail = (await emailsTo(p.guide.user.email)).find((m) => m.subject === "A Seeker has been given your details")!;
    expect(mail).toBeDefined();
    expect(mail.text).toMatch(/Category: Career Stagnation/);
    expect(mail.text).toContain(p.seeker.form.query);
    expect(mail.text).toContain("I admire your path.");
    expect(mail.text).toMatch(/including your phone number/);
    expect(mail.text).not.toMatch(/\/review\//); // no link to act on
    expect(mail.text).toContain(`Reply to the Seeker at: ${p.seeker.user.email}`);
    expect(mail.text).toMatch(/don't share their email address with anyone else/);
    expect(mail.text).not.toMatch(/no contact details/i);
    for (const secret of [p.seeker.form.memberId, PHONE, "9876543210"]) expect(mail.text).not.toContain(secret);
  });

  it("says no number was shared when the Guide has none", async () => {
    const p = await connectedPair({ phone: null });
    const mail = (await emailsTo(p.guide.user.email)).find((m) => m.subject === "A Seeker has been given your details")!;
    expect(mail.text).not.toMatch(/including your phone number/);
    expect(mail.text).toMatch(/didn't provide a phone number/);
  });
});

describe("listing and legacy rows", () => {
  it("lists the Seeker's connections, newest first", async () => {
    const p = await connectedPair();
    const list = await listSeekerConnections(p.seeker.user.id);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: p.requestId, status: "approved" });
  });

  it("closes requests left pending by the old approval flow, once", async () => {
    const seeker = await makeSeeker();
    const guide = await makeGuide();
    const [old] = await db().insert(connectionRequests).values({ seekerId: seeker.user.id, guideId: guide.user.id, status: "pending", tokenHash: randomUUID(), expiresAt: new Date() }).returning();
    expect(await closeLegacyPending()).toBeGreaterThanOrEqual(1);
    expect((await db().select().from(connectionRequests).where(eq(connectionRequests.id, old!.id)))[0]!.status).toBe("cancelled");
    expect(await closeLegacyPending()).toBe(0);
    const [{ n }] = await db().select({ n: count() }).from(connectionRequests).where(eq(connectionRequests.status, "pending"));
    expect(n).toBe(0);
  });
});

describe("what is sent, and when", () => {
  it("does not send a number that was saved before e-mailing it was part of the deal", async () => {
    const { phoneVault } = await import("@/server/db/schema");
    const { revealNumber } = await import("@/server/connections/reveal");
    const p = await makePair();
    await db().update(phoneVault).set({ emailConsentAt: null }).where(eq(phoneVault.guideId, p.guide.user.id));
    const r = await createRequest({ seekerId: p.seeker.user.id, matchId: p.match.id });
    if (!r.ok) throw new Error("expected ok");
    await drainJobs();
    const mail = (await emailsTo(p.seeker.user.email)).find((m) => m.subject === "Your Guide's details")!;
    expect(mail.text).toContain("didn't share a phone number");
    expect(mail.text).not.toContain(PHONE);
    expect(await revealNumber({ seekerId: p.seeker.user.id, connectionId: r.requestId })).toMatchObject({ ok: false, code: "unavailable" });
  });

  it("sends nothing if a report is filed, or the Seeker is suspended, before the e-mails go out", async () => {
    const reported = await makePair();
    const r1 = await createRequest({ seekerId: reported.seeker.user.id, matchId: reported.match.id });
    if (!r1.ok) throw new Error("expected ok");
    await db().insert(reports).values({ reporterId: reported.seeker.user.id, reportedId: reported.guide.user.id, reason: "spam" });
    const suspended = await makePair();
    const r2 = await createRequest({ seekerId: suspended.seeker.user.id, matchId: suspended.match.id });
    if (!r2.ok) throw new Error("expected ok");
    await db().update(users).set({ suspendedAt: new Date() }).where(eq(users.id, suspended.seeker.user.id));
    await drainJobs();
    expect(await emailsTo(reported.seeker.user.email)).toHaveLength(0);
    expect(await emailsTo(reported.guide.user.email)).toHaveLength(0);
    expect((await emailsTo(suspended.guide.user.email)).filter((m) => m.subject === "A Seeker has been given your details")).toHaveLength(0);
  });

  it("audits that a number was e-mailed (ids and a flag only)", async () => {
    const p = await connectedPair();
    const rows = await db().select().from(auditLog).where(and(eq(auditLog.action, "phone.emailed"), eq(auditLog.subjectId, p.requestId)));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actorId: p.seeker.user.id, targetId: p.guide.user.id, metadata: { included: true } });
    expect(JSON.stringify(rows[0])).not.toContain("9876543210");
  });

  it("quietly drops e-mail jobs left over from the old approval flow", async () => {
    const { processJobs } = await import("@/server/jobs/worker");
    const p = await makePair();
    for (const kind of ["connection_request", "request_approved", "request_declined", "request_expired"]) {
      await queue().enqueue(db(), "send_email", { kind, userId: p.seeker.user.id, requestId: randomUUID() }, { idempotencyKey: `legacy:${randomUUID()}` });
    }
    await processJobs({ maxMs: 20_000, maxJobs: 100 });
    const left = await db().select().from(jobs).where(and(eq(jobs.type, "send_email"), eq(jobs.status, "failed")));
    expect(left.filter((j) => String((j.payload as { userId?: string }).userId) === p.seeker.user.id)).toHaveLength(0);
  });
});

const SEEKER_MAIL = "Your Guide's details";
const GUIDE_MAIL = "A Seeker has been given your details";
const mailTo = async (address: string, subject: string) => (await emailsTo(address)).find((m) => m.subject === subject);
const sharedAudit = (requestId: string) => db().select().from(auditLog).where(and(eq(auditLog.action, "email.shared"), eq(auditLog.subjectId, requestId)));

describe("e-mail addresses in the connection e-mails", () => {
  it("includes the Guide's address in the Seeker's e-mail, and the Seeker's in the Guide's, when the Guide opted in", async () => {
    const p = await connectedPair({ guide: { shareEmail: true } });
    const toSeeker = (await mailTo(p.seeker.user.email, SEEKER_MAIL))!;
    const toGuide = (await mailTo(p.guide.user.email, GUIDE_MAIL))!;
    expect(toSeeker.text).toContain(`Email: ${p.guide.user.email}`);
    expect(toSeeker.text).not.toContain(p.seeker.user.email); // their own address is not echoed back
    expect(toGuide.text).toContain(`Reply to the Seeker at: ${p.seeker.user.email}`);
    expect(toGuide.text).toMatch(/If you have chosen to share your email address, Seekers who connect with you receive it/);
    expect(toGuide.text).not.toContain(p.guide.user.email);
  });

  it("leaves the Guide's address out when shareEmail is false, but still gives the Guide the Seeker's", async () => {
    const p = await connectedPair({ guide: { shareEmail: false } });
    const toSeeker = (await mailTo(p.seeker.user.email, SEEKER_MAIL))!;
    const toGuide = (await mailTo(p.guide.user.email, GUIDE_MAIL))!;
    expect(toSeeker.text).toContain(p.guide.form.jobTitle);
    expect(toSeeker.text).toContain(PHONE); // the phone number is a separate choice
    expect(toSeeker.text).not.toContain(p.guide.user.email);
    expect(toSeeker.text).not.toMatch(/Email:/);
    expect(toGuide.text).toContain(`Reply to the Seeker at: ${p.seeker.user.email}`);
    expect(toGuide.text).toMatch(/If you have chosen to share your email address, Seekers who connect with you receive it/);
  });

  it("treats a legacy Guide (profile data without shareEmail) as not sharing, whether or not they have a number", async () => {
    for (const phone of [PHONE, null]) {
      const p = await connectedPair({ legacyGuide: true, phone });
      const [row] = await db().select().from(guideProfiles).where(eq(guideProfiles.userId, p.guide.user.id));
      expect(row!.data).not.toHaveProperty("shareEmail"); // really legacy: the key is absent, not false
      const toSeeker = (await mailTo(p.seeker.user.email, SEEKER_MAIL))!;
      const toGuide = (await mailTo(p.guide.user.email, GUIDE_MAIL))!;
      expect(toSeeker.text).not.toContain(p.guide.user.email);
      expect(toSeeker.text).not.toMatch(/Email:/);
      expect(toGuide.text).toContain(p.seeker.user.email);
      expect(toGuide.text).toMatch(/If you have chosen to share your email address, Seekers who connect with you receive it/);
      expect(await sharedAudit(p.requestId).then((r) => r.map((a) => a.metadata))).toEqual([{ direction: "seeker_to_guide" }]);
    }
  });

  it("reads shareEmail when the job runs, not when the Seeker connected (untick, or tick, in between)", async () => {
    const unticked = await makePair({ guide: { shareEmail: true } });
    const a = await createRequest({ seekerId: unticked.seeker.user.id, matchId: unticked.match.id });
    const ticked = await makePair({ legacyGuide: true });
    const b = await createRequest({ seekerId: ticked.seeker.user.id, matchId: ticked.match.id });
    if (!a.ok || !b.ok) throw new Error("expected ok");
    await setShareEmail(unticked.guide.user.id, false);
    await setShareEmail(ticked.guide.user.id, true);
    await drainJobs();

    expect((await mailTo(unticked.seeker.user.email, SEEKER_MAIL))!.text).not.toContain(unticked.guide.user.email);
    expect((await mailTo(unticked.guide.user.email, GUIDE_MAIL))!.text).toMatch(/If you have chosen to share your email address/);
    expect((await sharedAudit(a.requestId)).map((r) => r.metadata)).toEqual([{ direction: "seeker_to_guide" }]);

    expect((await mailTo(ticked.seeker.user.email, SEEKER_MAIL))!.text).toContain(`Email: ${ticked.guide.user.email}`);
    expect((await mailTo(ticked.guide.user.email, GUIDE_MAIL))!.text).toMatch(/If you have chosen to share your email address/);
    expect((await sharedAudit(b.requestId)).map((r) => (r.metadata as { direction: string }).direction).sort()).toEqual(["guide_to_seeker", "seeker_to_guide"]);
  });

  it("uses the address the account has when the e-mail is sent", async () => {
    const p = await makePair();
    const r = await createRequest({ seekerId: p.seeker.user.id, matchId: p.match.id });
    if (!r.ok) throw new Error("expected ok");
    const newGuide = `changed-${randomUUID()}@example.com`;
    const newSeeker = `changed-${randomUUID()}@example.com`;
    await db().update(users).set({ email: newGuide }).where(eq(users.id, p.guide.user.id));
    await db().update(users).set({ email: newSeeker }).where(eq(users.id, p.seeker.user.id));
    await drainJobs();
    expect((await mailTo(newSeeker, SEEKER_MAIL))!.text).toContain(`Email: ${newGuide}`);
    expect((await mailTo(newGuide, GUIDE_MAIL))!.text).toContain(`Reply to the Seeker at: ${newSeeker}`);
  });

  it("never puts either address in a job row, an audit row or a log line", async () => {
    const warnings = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const lines = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.stubEnv("LOG_IN_TESTS", "true"); // the logger is silent under test otherwise
    try {
      const p = await makePair({ guide: { shareEmail: true } });
      const r = await createRequest({ seekerId: p.seeker.user.id, matchId: p.match.id, note: "Hello" });
      if (!r.ok) throw new Error("expected ok");
      await drainJobs();
      const addresses = [p.guide.user.email, p.seeker.user.email];

      // The mails did go out, with the addresses, so the absences below mean something.
      expect((await mailTo(p.seeker.user.email, SEEKER_MAIL))!.text).toContain(p.guide.user.email);
      expect((await mailTo(p.guide.user.email, GUIDE_MAIL))!.text).toContain(p.seeker.user.email);

      const jobRows = await db().select().from(jobs).where(or(eq(jobs.idempotencyKey, `guide_details:${r.requestId}`), eq(jobs.idempotencyKey, `guide_notified:${r.requestId}`), eq(jobs.idempotencyKey, `rating_reminder:${r.requestId}`)));
      expect(jobRows).toHaveLength(3);
      expect(jobRows.filter((j) => j.type === "send_email").every((j) => j.status === "done")).toBe(true); // the rating reminder waits days
      const auditRows = await db().select().from(auditLog).where(or(eq(auditLog.subjectId, r.requestId), eq(auditLog.actorId, p.seeker.user.id), eq(auditLog.actorId, p.guide.user.id), eq(auditLog.targetId, p.seeker.user.id), eq(auditLog.targetId, p.guide.user.id)));
      expect(auditRows.map((a) => a.action)).toEqual(expect.arrayContaining(["phone.emailed", "email.shared"]));

      const logged = [...lines.mock.calls, ...warnings.mock.calls, ...errors.mock.calls].map((c) => c.map(String).join(" ")).join("\n");
      expect(logged).toContain("email.mock_sent"); // the logger was live while the e-mails went out
      for (const [what, text] of [["job rows", JSON.stringify(jobRows)], ["audit rows", JSON.stringify(auditRows)], ["logs", logged]] as const) {
        for (const address of addresses) expect(text, `${what} contain ${address}`).not.toContain(address);
      }
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("writes one 'email.shared' audit row per direction actually sent, with ids and a direction only", async () => {
    const p = await connectedPair({ guide: { shareEmail: true } });
    await drainJobs(); // running the queue again changes nothing
    const rows = await sharedAudit(p.requestId);
    expect(rows).toHaveLength(2);
    const toGuide = rows.find((r) => (r.metadata as { direction: string }).direction === "seeker_to_guide")!;
    const toSeeker = rows.find((r) => (r.metadata as { direction: string }).direction === "guide_to_seeker")!;
    // Actor: whose address was shared. Target: who it was sent to.
    expect(toGuide).toMatchObject({ actorId: p.seeker.user.id, targetId: p.guide.user.id, subjectType: "connection_request", metadata: { direction: "seeker_to_guide" } });
    expect(toSeeker).toMatchObject({ actorId: p.guide.user.id, targetId: p.seeker.user.id, subjectType: "connection_request", metadata: { direction: "guide_to_seeker" } });
    for (const r of rows) {
      expect(Object.keys(r.metadata as object)).toEqual(["direction"]); // the redactor would blank keys such as "email"
      for (const address of [p.guide.user.email, p.seeker.user.email]) expect(JSON.stringify(r)).not.toContain(address);
    }
    // The existing audit entry is unchanged: a flag, not an address.
    const [emailed] = await db().select().from(auditLog).where(and(eq(auditLog.action, "phone.emailed"), eq(auditLog.subjectId, p.requestId)));
    expect(emailed!.metadata).toEqual({ included: true });
  });

  it("writes only the seeker_to_guide row when the Guide's address was not sent", async () => {
    const p = await connectedPair({ guide: { shareEmail: false } });
    expect((await sharedAudit(p.requestId)).map((r) => r.metadata)).toEqual([{ direction: "seeker_to_guide" }]);
  });

  it("sends nothing and audits nothing when the Guide or Seeker was suspended or deleted, a report was filed or either side blocked, before the jobs ran", async () => {
    const cases: Array<[string, (p: Awaited<ReturnType<typeof makePair>>) => Promise<unknown>]> = [
      ["guide suspended", (p) => db().update(users).set({ suspendedAt: new Date() }).where(eq(users.id, p.guide.user.id))],
      ["guide deleted", (p) => db().update(users).set({ deletedAt: new Date() }).where(eq(users.id, p.guide.user.id))],
      ["seeker suspended", (p) => db().update(users).set({ suspendedAt: new Date() }).where(eq(users.id, p.seeker.user.id))],
      ["seeker deleted", (p) => db().update(users).set({ deletedAt: new Date() }).where(eq(users.id, p.seeker.user.id))],
      ["blocked by the Guide", (p) => db().insert(blocks).values({ blockerId: p.guide.user.id, blockedId: p.seeker.user.id })],
      ["blocked by the Seeker", (p) => db().insert(blocks).values({ blockerId: p.seeker.user.id, blockedId: p.guide.user.id })],
      ["reported by the Seeker", (p) => db().insert(reports).values({ reporterId: p.seeker.user.id, reportedId: p.guide.user.id, reason: "spam" })],
      ["reported by the Guide", (p) => db().insert(reports).values({ reporterId: p.guide.user.id, reportedId: p.seeker.user.id, reason: "spam" })],
    ];
    const made: Array<[string, Awaited<ReturnType<typeof makePair>>, string]> = [];
    for (const [name, change] of cases) {
      const p = await makePair({ guide: { shareEmail: true } });
      const r = await createRequest({ seekerId: p.seeker.user.id, matchId: p.match.id });
      if (!r.ok) throw new Error("expected ok");
      await change(p);
      made.push([name, p, r.requestId]);
    }
    await drainJobs();
    for (const [name, p, requestId] of made) {
      // A deleted or suspended party gets nothing either; nobody gets the other's address.
      for (const address of [p.seeker.user.email, p.guide.user.email]) {
        expect(await emailsTo(address), `${name}: mail to ${address}`).toHaveLength(0);
      }
      expect(await sharedAudit(requestId), name).toHaveLength(0);
    }
  });
});

describe("e-mails queued before the address-sharing dialog existed", () => {
  it("do not carry the Seeker's address, because that Seeker never agreed to share it", async () => {
    const p = await makePair();
    const r = await createRequest({ seekerId: p.seeker.user.id, matchId: p.match.id });
    if (!r.ok) throw new Error("expected ok");
    // Turn the queued Guide e-mail into the shape the older flow produced: no `shares` marker.
    await db().update(jobs).set({ payload: { kind: "guide_notified", userId: p.guide.user.id, requestId: r.requestId } }).where(eq(jobs.idempotencyKey, `guide_notified:${r.requestId}`));
    await drainJobs();
    const mail = (await emailsTo(p.guide.user.email)).find((m) => m.subject === "A Seeker has been given your details")!;
    expect(mail).toBeDefined();
    expect(mail.text).not.toContain(p.seeker.user.email);
    expect(mail.text).not.toMatch(/Reply to the Seeker at/);
    expect(await db().select().from(auditLog).where(and(eq(auditLog.action, "email.shared"), eq(auditLog.subjectId, r.requestId)))).not.toContainEqual(expect.objectContaining({ metadata: { direction: "seeker_to_guide" } }));
  });
});
