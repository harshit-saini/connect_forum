import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { counters, guideProfiles, phoneVault, seekerProfiles, userRoles } from "@/server/db/schema";
import { loadProfileState, saveProfile } from "@/server/profile/service";
import { openRow } from "@/server/vault";
import { createUser, guideForm, nextGuideMemberId, PHONE, seekerForm } from "./fixtures";

const poolVersion = async () => (await db().select().from(counters).where(eq(counters.name, "guide_pool_version")))[0]?.value ?? 0;

describe("seeker registration", () => {
  it("registers from one form: derives columns, stores the normalised member ID and the role", async () => {
    const u = await createUser();
    const form = seekerForm({ memberId: ` ${seekerForm().memberId.toLowerCase()} ` });
    expect(await saveProfile({ userId: u.id, role: "seeker", values: form })).toEqual({ ok: true, created: true });

    const [p] = await db().select().from(seekerProfiles).where(eq(seekerProfiles.userId, u.id));
    expect(p?.profileCompletedAt).toBeInstanceOf(Date);
    expect(p?.profileVersion).toBe(1);
    expect(p?.category).toBe("career_stagnation");
    expect(p?.memberId).toBe(form.memberId.trim().toUpperCase());
    // The member ID and the consent box are not part of the stored answers.
    expect(p?.data).not.toHaveProperty("memberId");
    expect(p?.data).not.toHaveProperty("agree");
    expect(p?.data).toHaveProperty("consentedAt");
    expect((await db().select().from(userRoles).where(eq(userRoles.userId, u.id)))[0]?.role).toBe("seeker");
  });

  it("rejects contact details in the question with the standard message", async () => {
    const u = await createUser();
    const r = await saveProfile({ userId: u.id, role: "seeker", values: seekerForm({ query: "I feel stuck in my job, email me at x@y.com about it" }) });
    expect(r).toMatchObject({ ok: false, fieldErrors: { query: "Please remove contact details. Contact details are only shared after approval." } });
  });

  it("requires the category, a question and the consent", async () => {
    const u = await createUser();
    const r = await saveProfile({ userId: u.id, role: "seeker", values: { ...seekerForm(), category: "astrology", query: "short", agree: false } });
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(Object.keys(r.fieldErrors).sort()).toEqual(["agree", "category", "query"]);
  });

  it("stores no alias: an alias key in the form is dropped and the profile has none", async () => {
    const u = await createUser();
    const form = { ...seekerForm(), alias: "Curious Falcon" };
    expect(await saveProfile({ userId: u.id, role: "seeker", values: form })).toMatchObject({ ok: true });
    const [p] = await db().select().from(seekerProfiles).where(eq(seekerProfiles.userId, u.id));
    expect(p?.data).not.toHaveProperty("alias");
    expect(await loadProfileState(u.id, "seeker")).toMatchObject({ completed: true });
    expect((await loadProfileState(u.id, "seeker")).data).not.toHaveProperty("alias");
  });
});

describe("member ID check", () => {
  it("rejects an ID that is not on the allow-list", async () => {
    const u = await createUser();
    const r = await saveProfile({ userId: u.id, role: "seeker", values: seekerForm({ memberId: "NOT-A-MEMBER" }) });
    expect(r).toEqual({ ok: false, fieldErrors: { memberId: "We couldn't find that member ID. Check it and try again." } });
    expect(await db().select().from(seekerProfiles).where(eq(seekerProfiles.userId, u.id))).toHaveLength(0);
    expect(await db().select().from(userRoles).where(eq(userRoles.userId, u.id))).toHaveLength(0);
  });

  it("does not accept a Guide ID for a Seeker, or the other way round", async () => {
    const s = await createUser();
    const g = await createUser();
    expect(await saveProfile({ userId: s.id, role: "seeker", values: seekerForm({ memberId: nextGuideMemberId() }) })).toMatchObject({ ok: false, fieldErrors: { memberId: expect.any(String) } });
    expect(await saveProfile({ userId: g.id, role: "guide", values: guideForm({ memberId: seekerForm().memberId }), phone: PHONE })).toMatchObject({ ok: false, fieldErrors: { memberId: expect.any(String) } });
  });

  it("is not case or whitespace sensitive", async () => {
    const u = await createUser();
    const id = seekerForm().memberId;
    const messy = `  ${id.slice(0, 3).toLowerCase()} ${id.slice(3).toLowerCase()} `;
    expect(await saveProfile({ userId: u.id, role: "seeker", values: seekerForm({ memberId: messy }) })).toMatchObject({ ok: true });
  });

  it("lets one ID register only one account", async () => {
    const a = await createUser();
    const b = await createUser();
    const id = seekerForm().memberId;
    expect(await saveProfile({ userId: a.id, role: "seeker", values: seekerForm({ memberId: id }) })).toMatchObject({ ok: true });
    expect(await saveProfile({ userId: b.id, role: "seeker", values: seekerForm({ memberId: id }) })).toEqual({ ok: false, fieldErrors: { memberId: "This member ID is already registered." } });
  });

  it("keeps the registered ID when an edit tries to change it", async () => {
    const u = await createUser();
    const form = seekerForm();
    await saveProfile({ userId: u.id, role: "seeker", values: form });
    expect(await saveProfile({ userId: u.id, role: "seeker", values: { ...form, memberId: seekerForm().memberId, query: "Now I am mostly unsure which direction to take from here." } })).toMatchObject({ ok: true, created: false });
    const [p] = await db().select().from(seekerProfiles).where(eq(seekerProfiles.userId, u.id));
    expect(p?.memberId).toBe(form.memberId);
  });

  it("treats a legacy profile without a member ID as not registered", async () => {
    const u = await createUser("seeker");
    await db().insert(seekerProfiles).values({ userId: u.id, data: { old: "long wizard answers" }, profileCompletedAt: new Date(), profileVersion: 3 });
    expect((await loadProfileState(u.id, "seeker")).completed).toBe(false);
    expect(await saveProfile({ userId: u.id, role: "seeker", values: seekerForm() })).toEqual({ ok: true, created: true });
    const [p] = await db().select().from(seekerProfiles).where(eq(seekerProfiles.userId, u.id));
    expect(p?.memberId).not.toBeNull();
    expect(p?.profileVersion).toBe(4);
  });

  it("keeps one completed role per account", async () => {
    const u = await createUser();
    expect(await saveProfile({ userId: u.id, role: "seeker", values: seekerForm() })).toMatchObject({ ok: true });
    const r = await saveProfile({ userId: u.id, role: "guide", values: guideForm(), phone: PHONE });
    expect(r).toMatchObject({ ok: false, fieldErrors: { _: expect.stringMatching(/already registered as a Seeker.*different email/) } });
    expect((await db().select().from(userRoles).where(eq(userRoles.userId, u.id)))[0]?.role).toBe("seeker");
    expect(await db().select().from(guideProfiles).where(eq(guideProfiles.userId, u.id))).toHaveLength(0);
  });

  it("replaces a stale role row (profile never completed) when the account registers as the other role", async () => {
    // An incomplete Guide row, and a legacy Seeker row without a member ID, both count as not registered.
    const staleGuide = await createUser("guide");
    await db().insert(guideProfiles).values({ userId: staleGuide.id, data: {}, profileVersion: 0 });
    expect(await saveProfile({ userId: staleGuide.id, role: "seeker", values: seekerForm() })).toEqual({ ok: true, created: true });
    expect((await db().select().from(userRoles).where(eq(userRoles.userId, staleGuide.id)))).toMatchObject([{ role: "seeker" }]);
    expect((await loadProfileState(staleGuide.id, "seeker")).completed).toBe(true);

    const legacySeeker = await createUser("seeker");
    await db().insert(seekerProfiles).values({ userId: legacySeeker.id, data: { old: "answers" }, profileCompletedAt: new Date(), profileVersion: 2 });
    expect(await saveProfile({ userId: legacySeeker.id, role: "guide", values: guideForm(), phone: PHONE })).toEqual({ ok: true, created: true });
    expect((await db().select().from(userRoles).where(eq(userRoles.userId, legacySeeker.id)))).toMatchObject([{ role: "guide" }]);
    expect((await loadProfileState(legacySeeker.id, "guide")).completed).toBe(true);
  });

  it("refuses the other role once a role is completed, and says to use a different email", async () => {
    const g = await createUser();
    expect(await saveProfile({ userId: g.id, role: "guide", values: guideForm(), phone: PHONE })).toMatchObject({ ok: true });
    const r = await saveProfile({ userId: g.id, role: "seeker", values: seekerForm() });
    expect(r).toEqual({ ok: false, fieldErrors: { _: "This email is already registered as a Guide. Use a different email address." } });
    expect((await db().select().from(userRoles).where(eq(userRoles.userId, g.id)))[0]?.role).toBe("guide");
    expect(await db().select().from(seekerProfiles).where(eq(seekerProfiles.userId, g.id))).toHaveLength(0);
  });
});

describe("guide registration", () => {
  it("encrypts the phone number and keeps it out of the profile row", async () => {
    const u = await createUser();
    const before = await poolVersion();
    expect(await saveProfile({ userId: u.id, role: "guide", values: guideForm(), phone: PHONE })).toMatchObject({ ok: true });

    const [row] = await db().select().from(phoneVault).where(eq(phoneVault.guideId, u.id));
    expect(row!.encryptedNumber.toString("utf8")).not.toContain("9876543210");
    expect(openRow(row!, u.id)).toBe(PHONE);
    expect(row!.last4).toBe("3210");

    const [g] = await db().select().from(guideProfiles).where(eq(guideProfiles.userId, u.id));
    expect(JSON.stringify(g)).not.toContain("9876543210");
    expect(g!.categories).toEqual(["career_stagnation", "uncertainty"]);
    expect(g!.profileVersion).toBe(1);
    expect(await poolVersion()).toBeGreaterThan(before);
  });

  it("requires a phone number in a valid format, and at least one category", async () => {
    const u = await createUser();
    expect(await saveProfile({ userId: u.id, role: "guide", values: guideForm() })).toMatchObject({ ok: false, fieldErrors: { phone: "Your phone number is required" } });
    expect(await saveProfile({ userId: u.id, role: "guide", values: guideForm(), phone: "98765" })).toMatchObject({ ok: false, fieldErrors: { phone: expect.any(String) } });
    expect(await saveProfile({ userId: u.id, role: "guide", values: guideForm({ categories: [] }), phone: PHONE })).toMatchObject({ ok: false, fieldErrors: { categories: expect.any(String) } });
    expect(await db().select().from(guideProfiles).where(eq(guideProfiles.userId, u.id))).toHaveLength(0);
  });

  it("only bumps profile_version and the guide pool for matching-relevant edits", async () => {
    const u = await createUser();
    const form = guideForm();
    await saveProfile({ userId: u.id, role: "guide", values: form, phone: PHONE });
    const before = await poolVersion();

    // The saved number is reused when no new one is given; a leftover alias key is not matching-relevant.
    expect(await saveProfile({ userId: u.id, role: "guide", values: { ...form, alias: "Renamed" } })).toMatchObject({ ok: true, created: false });
    expect(await poolVersion()).toBe(before);
    expect((await db().select().from(guideProfiles).where(eq(guideProfiles.userId, u.id)))[0]!.profileVersion).toBe(1);

    expect(await saveProfile({ userId: u.id, role: "guide", values: { ...form, categories: ["uncertainty"] } })).toMatchObject({ ok: true });
    expect(await poolVersion()).toBe(before + 1);
    const [g] = await db().select().from(guideProfiles).where(eq(guideProfiles.userId, u.id));
    expect(g!.profileVersion).toBe(2);
    expect(g!.categories).toEqual(["uncertainty"]);
  });
});

describe("legacy alias data", () => {
  it("is never returned to the member or exported, even when an old row still carries one", async () => {
    const { buildExport } = await import("@/server/account");
    const u = await createUser();
    await saveProfile({ userId: u.id, role: "seeker", values: seekerForm() });
    await db().update(seekerProfiles).set({ data: sql`${seekerProfiles.data} || '{"alias":"OldAlias42"}'::jsonb` }).where(eq(seekerProfiles.userId, u.id));
    expect((await loadProfileState(u.id, "seeker")).data).not.toHaveProperty("alias");
    expect(JSON.stringify(await buildExport(u.id))).not.toContain("OldAlias42");
  });

  it("serialises two simultaneous registrations for one account into a single role", async () => {
    const u = await createUser();
    const [a, b] = await Promise.all([
      saveProfile({ userId: u.id, role: "seeker", values: seekerForm() }),
      saveProfile({ userId: u.id, role: "guide", values: guideForm(), phone: PHONE }),
    ]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1); // the loser is told the account is already registered
    expect(await db().select().from(userRoles).where(eq(userRoles.userId, u.id))).toHaveLength(1);
  });
});
