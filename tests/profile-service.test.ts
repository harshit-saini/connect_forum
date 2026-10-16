import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { counters, guideProfiles, phoneVault, profileDrafts, seekerProfiles } from "@/server/db/schema";
import { autosaveDraft, loadProfileState, saveStep, submitProfile } from "@/server/profile/service";
import { openRow } from "@/server/vault";
import { createUser, guideSteps, seekerSteps, uniqueAlias } from "./fixtures";

const PHONE = "+919876543210";

async function fillSeeker(userId: string, steps = seekerSteps()) {
  for (const step of ["basics", "background", "goals", "preferences"] as const) {
    const r = await saveStep({ userId, role: "seeker", step, values: steps[step] });
    expect(r, step).toEqual({ ok: true });
  }
}
async function fillGuide(userId: string, steps = guideSteps()) {
  for (const step of ["basics", "background", "expertise"] as const) {
    expect(await saveStep({ userId, role: "guide", step, values: steps[step] }), step).toEqual({ ok: true });
  }
  expect(await saveStep({ userId, role: "guide", step: "availability", values: steps.availability, phone: PHONE })).toEqual({ ok: true });
}
const poolVersion = async () => (await db().select().from(counters).where(eq(counters.name, "guide_pool_version")))[0]?.value ?? 0;

describe("seeker onboarding", () => {
  it("saves steps as a draft, then submits and derives query columns", async () => {
    const u = await createUser("seeker");
    await fillSeeker(u.id);
    const [draft] = await db().select().from(profileDrafts).where(eq(profileDrafts.userId, u.id));
    expect(draft?.stepReached).toBe(4);

    expect(await submitProfile({ userId: u.id, role: "seeker" })).toEqual({ ok: true });
    const [p] = await db().select().from(seekerProfiles).where(eq(seekerProfiles.userId, u.id));
    expect(p?.profileCompletedAt).toBeInstanceOf(Date);
    expect(p?.profileVersion).toBe(1);
    expect(p?.helpNeeded).toEqual(["career_switch", "interview_prep", "skill_roadmap"]);
    expect(p?.minGuideExperience).toBe(5);
    expect(p?.excludedCompanies).toEqual(["acme"]);
    expect(p?.skills).toEqual(["python", "sql", "aws"]);
    expect((await db().select().from(profileDrafts).where(eq(profileDrafts.userId, u.id))).length).toBe(0);
  });

  it("rejects contact details in free text with the standard message", async () => {
    const u = await createUser("seeker");
    const s = seekerSteps();
    const r = await saveStep({ userId: u.id, role: "seeker", step: "goals", values: { ...s.goals, challenge: s.goals.challenge + " Email me at x@y.com" } });
    expect(r).toMatchObject({ ok: false, fieldErrors: { challenge: "Please remove contact details. Contact details are only shared after approval." } });
  });

  it("refuses to submit while a step is missing and points at it", async () => {
    const u = await createUser("seeker");
    const s = seekerSteps();
    await saveStep({ userId: u.id, role: "seeker", step: "basics", values: s.basics });
    const r = await submitProfile({ userId: u.id, role: "seeker" });
    expect(r).toMatchObject({ ok: false, step: "background" });
  });

  it("enforces unique aliases case-insensitively and allows keeping your own", async () => {
    const a = await createUser("seeker");
    const b = await createUser("seeker");
    const alias = uniqueAlias("Dup");
    expect(await saveStep({ userId: a.id, role: "seeker", step: "basics", values: seekerSteps(alias).basics })).toEqual({ ok: true });
    expect(await saveStep({ userId: a.id, role: "seeker", step: "basics", values: seekerSteps(alias).basics })).toEqual({ ok: true });
    const r = await saveStep({ userId: b.id, role: "seeker", step: "basics", values: seekerSteps(alias.toUpperCase()).basics });
    expect(r).toMatchObject({ ok: false, fieldErrors: { alias: "That alias is already taken" } });
    expect(await saveStep({ userId: b.id, role: "seeker", step: "basics", values: seekerSteps("Admin").basics })).toMatchObject({ ok: false });
  });

  it("autosave stores drafts without validation but never a phone and only before completion", async () => {
    const u = await createUser("seeker");
    expect(await autosaveDraft({ userId: u.id, role: "seeker", step: "goals", values: { challenge: "half typed", phone: PHONE } })).toEqual({ ok: true });
    const state = await loadProfileState(u.id, "seeker");
    expect(state.data.goals).toEqual({ challenge: "half typed" });
    await fillSeeker(u.id);
    await submitProfile({ userId: u.id, role: "seeker" });
    expect(await autosaveDraft({ userId: u.id, role: "seeker", step: "goals", values: { challenge: "x" } })).toEqual({ ok: false });
  });

  it("bumps profile_version only for matching-relevant edits after completion", async () => {
    const u = await createUser("seeker");
    const s = seekerSteps();
    await fillSeeker(u.id, s);
    await submitProfile({ userId: u.id, role: "seeker" });
    const version = async () => (await db().select().from(seekerProfiles).where(eq(seekerProfiles.userId, u.id)))[0]!.profileVersion;

    await saveStep({ userId: u.id, role: "seeker", step: "basics", values: { ...s.basics, city: "Pune" } });
    expect(await version()).toBe(1);
    await saveStep({ userId: u.id, role: "seeker", step: "goals", values: { ...s.goals, primaryGoal: "better_job" } });
    expect(await version()).toBe(2);
    expect((await db().select().from(seekerProfiles).where(eq(seekerProfiles.userId, u.id)))[0]!.primaryGoal).toBe("better_job");
  });
});

describe("guide onboarding", () => {
  it("encrypts the phone in the vault and keeps it out of drafts and profile data", async () => {
    const u = await createUser("guide");
    const before = await poolVersion();
    await fillGuide(u.id);

    const [row] = await db().select().from(phoneVault).where(eq(phoneVault.guideId, u.id));
    expect(row!.encryptedNumber.toString("utf8")).not.toContain("9876543210");
    expect(openRow(row!, u.id)).toBe(PHONE);
    expect(row!.last4).toBe("3210");

    expect(await submitProfile({ userId: u.id, role: "guide" })).toEqual({ ok: true });
    const [g] = await db().select().from(guideProfiles).where(eq(guideProfiles.userId, u.id));
    expect(JSON.stringify(g)).not.toContain("9876543210");
    expect(g!.helpTypes).toEqual(["career_switch", "interview_prep"]);
    expect(g!.maxNewSeekersPerMonth).toBe(3);
    expect(await poolVersion()).toBeGreaterThan(before);
  });

  it("requires a phone number and a valid format", async () => {
    const u = await createUser("guide");
    const s = guideSteps();
    expect(await saveStep({ userId: u.id, role: "guide", step: "availability", values: s.availability })).toMatchObject({ ok: false, fieldErrors: { phone: "Your phone number is required" } });
    expect(await saveStep({ userId: u.id, role: "guide", step: "availability", values: s.availability, phone: "98765" })).toMatchObject({ ok: false, fieldErrors: { phone: expect.any(String) } });
  });

  it("requires at least one past role in the timeline", async () => {
    const u = await createUser("guide");
    const s = guideSteps();
    const r = await saveStep({ userId: u.id, role: "guide", step: "background", values: { ...s.background, timeline: [] } });
    expect(r).toMatchObject({ ok: false });
  });

  it("bumps guide_pool_version when a completed guide pauses matching", async () => {
    const u = await createUser("guide");
    const s = guideSteps();
    await fillGuide(u.id, s);
    await submitProfile({ userId: u.id, role: "guide" });
    const before = await poolVersion();
    await saveStep({ userId: u.id, role: "guide", step: "availability", values: { ...s.availability, pauseMatching: true } });
    expect(await poolVersion()).toBe(before + 1);
    expect((await db().select().from(guideProfiles).where(eq(guideProfiles.userId, u.id)))[0]!.matchingPaused).toBe(true);
    // changing only the contact hint is not matching-relevant
    await saveStep({ userId: u.id, role: "guide", step: "availability", values: { ...s.availability, pauseMatching: true, bestTime: "Sunday" } });
    expect(await poolVersion()).toBe(before + 1);
  });
});
