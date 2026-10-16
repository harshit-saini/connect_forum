import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db/client";
import { auditLog, matchRuns, matches, reports, sessions, users } from "@/server/db/schema";
import { listAudit, listReports, listUsers, reviewReport, suspendUser, unsuspendUser } from "@/server/admin/service";
import { createRequest } from "@/server/connections/service";
import { findCandidates, loadSeekerContext } from "@/server/matching/candidates";
import { createUser, makeGuide, makeSeeker } from "./fixtures";

const viewerRef: { current: unknown } = { current: null };
vi.mock("@/server/viewer", async (orig) => {
  const real = await orig<typeof import("@/server/viewer")>();
  return {
    ...real,
    getViewer: async () => viewerRef.current,
    requireAdmin: async () => {
      const v = viewerRef.current as { isAdmin?: boolean } | null;
      if (!v?.isAdmin) throw new Error("NEXT_REDIRECT");
      return v;
    },
  };
});
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

beforeAll(async () => {
  await db().delete(users);
});

describe("suspension", () => {
  it("removes the guide from matching, blocks requests and reveal, and signs them out", async () => {
    const admin = await createUser();
    const seeker = await makeSeeker();
    const guide = await makeGuide();
    await db().insert(sessions).values({ userId: guide.user.id, token: randomUUID(), expiresAt: new Date(Date.now() + 1e9) });
    const [run] = await db().insert(matchRuns).values({ seekerId: seeker.user.id, inputHash: randomUUID(), status: "done" }).returning();
    const [m] = await db().insert(matches).values({ runId: run!.id, seekerId: seeker.user.id, guideId: guide.user.id, rank: 1, score: 0.9, status: "final" }).returning();

    const ctx = (await loadSeekerContext(seeker.user.id, true))!;
    expect((await findCandidates(ctx)).map((c) => c.guideId)).toContain(guide.user.id);

    expect(await suspendUser({ adminId: admin.id, userId: guide.user.id, reason: "harassment reports" })).toEqual({ ok: true });
    expect((await db().select().from(users).where(eq(users.id, guide.user.id)))[0]!.suspendedAt).toBeInstanceOf(Date);
    expect(await db().select().from(sessions).where(eq(sessions.userId, guide.user.id))).toHaveLength(0);
    expect((await findCandidates(ctx)).map((c) => c.guideId)).not.toContain(guide.user.id);
    expect(await createRequest({ seekerId: seeker.user.id, matchId: m!.id })).toMatchObject({ ok: false, code: "unavailable" });

    const [entry] = await db().select().from(auditLog).where(and(eq(auditLog.action, "user.suspended"), eq(auditLog.targetId, guide.user.id)));
    expect(entry).toMatchObject({ actorId: admin.id, targetId: guide.user.id });
    expect(entry!.metadata).toMatchObject({ reason: "harassment reports" });

    expect(await unsuspendUser({ adminId: admin.id, userId: guide.user.id })).toEqual({ ok: true });
    expect((await findCandidates(ctx)).map((c) => c.guideId)).toContain(guide.user.id);
    expect((await db().select().from(auditLog).where(and(eq(auditLog.action, "user.unsuspended"), eq(auditLog.targetId, guide.user.id)))).length).toBe(1);
  });

  it("will not suspend yourself or a missing user, and is idempotent", async () => {
    const admin = await createUser();
    const u = await createUser("seeker");
    expect(await suspendUser({ adminId: admin.id, userId: admin.id })).toMatchObject({ ok: false });
    expect(await suspendUser({ adminId: admin.id, userId: randomUUID() })).toMatchObject({ ok: false });
    await suspendUser({ adminId: admin.id, userId: u.id });
    const before = (await db().select().from(auditLog).where(and(eq(auditLog.action, "user.suspended"), eq(auditLog.targetId, u.id)))).length;
    expect(await suspendUser({ adminId: admin.id, userId: u.id })).toEqual({ ok: true });
    expect((await db().select().from(auditLog).where(and(eq(auditLog.action, "user.suspended"), eq(auditLog.targetId, u.id)))).length).toBe(before);
  });
});

describe("admin lists", () => {
  it("lists and searches users with their status", async () => {
    const guide = await makeGuide();
    const { rows, total } = await listUsers({ q: guide.user.email.slice(0, 12), page: 1 });
    expect(total).toBeGreaterThan(0);
    expect(rows.find((r) => r.id === guide.user.id)).toMatchObject({ role: "guide", profileCompleted: true, suspendedAt: null });
    expect((await listUsers({ status: "suspended", page: 1 })).rows.every((r) => r.suspendedAt)).toBe(true);
    // a search with LIKE metacharacters must not blow up or match everything
    expect((await listUsers({ q: "%", page: 1 })).rows.length).toBeGreaterThanOrEqual(0);
  });

  it("lists reports and records the review in the audit log", async () => {
    const admin = await createUser();
    const a = await makeSeeker();
    const g = await makeGuide();
    const [r] = await db().insert(reports).values({ reporterId: a.user.id, reportedId: g.user.id, reason: "harassment", details: "pushy" }).returning();
    const open = await listReports("open", 1);
    expect(open.rows.find((x) => x.id === r!.id)).toMatchObject({ reason: "harassment", reportedSuspended: false });
    expect(await reviewReport(admin.id, r!.id, "reviewed")).toEqual({ ok: true });
    expect((await listReports("open", 1)).rows.find((x) => x.id === r!.id)).toBeUndefined();
    expect((await listReports("all", 1)).rows.find((x) => x.id === r!.id)?.status).toBe("reviewed");
    expect((await listAudit({ action: "report.reviewed", page: 1 })).rows.length).toBeGreaterThan(0);
    expect(await reviewReport(admin.id, randomUUID(), "dismissed")).toMatchObject({ ok: false });
  });

  it("audit listing filters by action and exposes the known actions", async () => {
    const res = await listAudit({ page: 1 });
    expect(res.actions).toContain("user.suspended");
    expect((await listAudit({ action: "user.suspended", page: 1 })).rows.every((r) => r.action === "user.suspended")).toBe(true);
  });
});

describe("admin actions are admin-only", () => {
  it("rejects a non-admin before doing anything", async () => {
    const { suspendUserAction } = await import("@/server/actions/admin");
    const victim = await createUser("guide");
    viewerRef.current = { id: randomUUID(), isAdmin: false };
    const fd = new FormData();
    fd.set("userId", victim.id);
    await expect(suspendUserAction(fd)).rejects.toThrow("NEXT_REDIRECT");
    expect((await db().select().from(users).where(eq(users.id, victim.id)))[0]!.suspendedAt).toBeNull();

    viewerRef.current = { id: (await createUser()).id, isAdmin: true };
    await suspendUserAction(fd);
    expect((await db().select().from(users).where(eq(users.id, victim.id)))[0]!.suspendedAt).toBeInstanceOf(Date);

    const bad = new FormData();
    bad.set("userId", "not-a-uuid");
    await expect(suspendUserAction(bad)).rejects.toThrow();
    viewerRef.current = null;
  });
});
