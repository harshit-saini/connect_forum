import { randomUUID } from "node:crypto";
import { db } from "@/server/db/client";
import { users, userRoles } from "@/server/db/schema";
import { saveProfile } from "@/server/profile/service";

export async function createUser(role?: "seeker" | "guide", email = `u-${randomUUID()}@example.com`) {
  const [u] = await db().insert(users).values({ email, emailVerified: true }).returning();
  if (role) await db().insert(userRoles).values({ userId: u!.id, role });
  return u!;
}

export const uniqueAlias = (p = "Test") => `${p}${Math.random().toString(36).slice(2, 8)}`;

let seekerIds = 0;
let guideIds = 0;
/** The next member ID on the test allow-list (see tests/helpers/setup.ts). */
export const nextSeekerMemberId = () => `S${process.env.TEST_MEMBER_PREFIX}${seekerIds++}`;
export const nextGuideMemberId = () => `G${process.env.TEST_MEMBER_PREFIX}${guideIds++}`;

export const PHONE = "+919876543210";

export type SeekerForm = {
  alias: string; memberId: string; category: string; query: string; languages: string[]; totalYears: number; agree: boolean;
};
export type GuideForm = {
  alias: string; memberId: string; categories: string[]; jobTitle: string; totalYears: number; about: string;
  languages: string[]; maxNewSeekersPerMonth: number; agree: boolean;
};

export const seekerForm = (over: Partial<SeekerForm> = {}): SeekerForm => ({
  alias: uniqueAlias("Seek"),
  memberId: nextSeekerMemberId(),
  category: "career_stagnation",
  query: "I have been in the same role for five years and do not know how to move up.",
  languages: ["english", "hindi"],
  totalYears: 5,
  agree: true,
  ...over,
});

export const guideForm = (over: Partial<GuideForm> = {}): GuideForm => ({
  alias: uniqueAlias("Guide"),
  memberId: nextGuideMemberId(),
  categories: ["career_stagnation", "uncertainty"],
  jobTitle: "Engineering manager",
  totalYears: 12,
  about: "I moved from engineer to manager and have mentored many people who felt stuck in their roles.",
  languages: ["english", "hindi"],
  maxNewSeekersPerMonth: 3,
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

export async function makeGuide(over: Partial<GuideForm> = {}) {
  const u = await createUser();
  const form = guideForm(over);
  const r = await saveProfile({ userId: u.id, role: "guide", values: form, phone: PHONE });
  if (!r.ok) throw new Error(`guide: ${JSON.stringify(r)}`);
  return { user: u, form };
}
