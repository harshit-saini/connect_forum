import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { guideProfiles, matchRuns, matches, users, userRoles } from "@/server/db/schema";
import { createRequest } from "@/server/connections/service";
import { processJobs } from "@/server/jobs/worker";
import { saveProfile } from "@/server/profile/service";

export async function createUser(role?: "seeker" | "guide", email = `u-${randomUUID()}@example.com`) {
  const [u] = await db().insert(users).values({ email, emailVerified: true }).returning();
  if (role) await db().insert(userRoles).values({ userId: u!.id, role });
  return u!;
}

let seekerIds = 0;
let guideIds = 0;
/** The next member ID on the test allow-list (see tests/helpers/setup.ts). */
export const nextSeekerMemberId = () => `S${process.env.TEST_MEMBER_PREFIX}${seekerIds++}`;
export const nextGuideMemberId = () => `G${process.env.TEST_MEMBER_PREFIX}${guideIds++}`;

export const PHONE = "+919876543210";

export type SeekerForm = {
  memberId: string; category: string; query: string; totalYears: number; agree: boolean;
};
export type GuideForm = {
  memberId: string; categories: string[]; jobTitle: string; totalYears: number; about: string;
  shareEmail: boolean; agree: boolean;
};

export const seekerForm = (over: Partial<SeekerForm> = {}): SeekerForm => ({
  memberId: nextSeekerMemberId(),
  category: "career_stagnation",
  query: "I have been in the same role for five years and do not know how to move up.",
  totalYears: 5,
  agree: true,
  ...over,
});

export const guideForm = (over: Partial<GuideForm> = {}): GuideForm => ({
  memberId: nextGuideMemberId(),
  categories: ["career_stagnation", "uncertainty"],
  jobTitle: "Engineering manager",
  totalYears: 12,
  about: "I moved from engineer to manager and have mentored many people who felt stuck in their roles.",
  shareEmail: true,
  agree: true,
  ...over,
});

export async function makeSeeker(over: Partial<SeekerForm> = {}) {
  const u = await createUser();
  const form = seekerForm(over);
  const r = await saveProfile({ userId: u.id, role: "seeker", values: form });
  if (!r.ok) throw new Error(`seeker: ${JSON.stringify(r)}`);
  return { user: u, form };
}

/** A completed Guide. They have a phone number on file unless `opts.phone` is null (the number is optional). */
export async function makeGuide(over: Partial<GuideForm> = {}, opts: { phone?: string | null } = {}) {
  const u = await createUser();
  const form = guideForm(over);
  const phone = opts.phone === null ? undefined : (opts.phone ?? PHONE);
  const r = await saveProfile({ userId: u.id, role: "guide", values: form, phone });
  if (!r.ok) throw new Error(`guide: ${JSON.stringify(r)}`);
  return { user: u, form };
}

/**
 * Makes a Guide's stored profile data look like one saved before shareEmail existed: the key is removed
 * (not set to false), as it is for real legacy rows.
 */
export async function makeLegacy(guideId: string) {
  await db().update(guideProfiles).set({ data: sql`${guideProfiles.data} - 'shareEmail'` }).where(eq(guideProfiles.userId, guideId));
}

/** Sets the Guide's stored shareEmail directly, as if they had edited their profile since. */
export async function setShareEmail(guideId: string, value: boolean) {
  await db().update(guideProfiles).set({ data: sql`${guideProfiles.data} || ${JSON.stringify({ shareEmail: value })}::jsonb` }).where(eq(guideProfiles.userId, guideId));
}

/** Runs every due job (profile embeddings from earlier fixtures included), not just one batch. */
export async function drainJobs() {
  while ((await processJobs({ maxMs: 20_000, maxJobs: 100 })) > 0);
}

/** A finished match run linking a Seeker to a Guide, as the matching pipeline would leave it. */
export async function makeMatch(seekerId: string, guideId: string) {
  const [run] = await db().insert(matchRuns).values({ seekerId, inputHash: randomUUID(), status: "done" }).returning();
  const [m] = await db().insert(matches).values({ runId: run!.id, seekerId, guideId, rank: 1, score: 0.9, explanation: "A fit", status: "final" }).returning();
  return m!;
}

/** A fresh Seeker and Guide plus their match, not yet connected. */
export async function makePair(opts: { guide?: Partial<GuideForm>; phone?: string | null; legacyGuide?: boolean } = {}) {
  const seeker = await makeSeeker();
  const guide = await makeGuide(opts.guide, { phone: opts.phone });
  if (opts.legacyGuide) await makeLegacy(guide.user.id); // profile data without shareEmail
  const match = await makeMatch(seeker.user.id, guide.user.id);
  return { seeker, guide, match };
}

/** A fresh pair where the Seeker has pressed "I want to connect" and the queued e-mails have been sent. */
export async function connectedPair(opts: { guide?: Partial<GuideForm>; phone?: string | null; note?: string; legacyGuide?: boolean } = {}) {
  const p = await makePair(opts);
  const r = await createRequest({ seekerId: p.seeker.user.id, matchId: p.match.id, note: opts.note });
  if (!r.ok) throw new Error(`connect failed: ${JSON.stringify(r)}`);
  await drainJobs();
  return { ...p, requestId: r.requestId, matchId: p.match.id };
}
