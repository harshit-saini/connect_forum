import "server-only";
import { eq } from "drizzle-orm";
import type { ZodError } from "zod";
import { normalizeEmpty } from "@/schemas/common";
import {
  profileSchema, STEP_ORDER, stepSchema, type GuideProfileData, type Role, type SeekerProfileData, type StepKey,
} from "@/schemas";
import { db } from "@/server/db/client";
import { guideProfiles, profileDrafts, seekerProfiles, userAliases } from "@/server/db/schema";
import { deriveGuide, deriveSeeker, isMatchingChange } from "./derive";
import { bumpCounter, GUIDE_POOL_VERSION } from "./counters";
import { onProfileChanged } from "./hooks";
import { isAcceptablePhone, phoneStatus, savePhone } from "./phone";

export type FieldErrors = Record<string, string>;
export type SaveResult = { ok: true } | { ok: false; fieldErrors: FieldErrors; formError?: string };
export type SubmitResult = { ok: true } | { ok: false; step: StepKey; fieldErrors: FieldErrors; formError?: string };

type Data = Record<string, Record<string, unknown>>;
type DataStep = Exclude<StepKey, "review">;

const RESERVED_ALIASES = new Set(["admin", "administrator", "support", "moderator", "connect", "system", "staff", "help", "official"]);
const MAX_DRAFT_BYTES = 60_000;

export function zodFieldErrors(error: ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    out[key] ??= issue.message;
  }
  return out;
}

function table(role: Role) {
  return role === "seeker" ? seekerProfiles : guideProfiles;
}

function uniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
}

export async function loadProfileState(userId: string, role: Role) {
  const t = table(role);
  const [profile] = await db().select().from(t).where(eq(t.userId, userId)).limit(1);
  const [draft] = await db().select().from(profileDrafts).where(eq(profileDrafts.userId, userId)).limit(1);
  const [alias] = await db().select().from(userAliases).where(eq(userAliases.userId, userId)).limit(1);
  const completed = Boolean(profile?.profileCompletedAt);
  const data = structuredClone((completed ? profile?.data : draft?.data) ?? {}) as Data;
  if (alias) data.basics = { alias: alias.alias, ...(data.basics ?? {}) };
  const phone = role === "guide" ? await phoneStatus(db(), userId) : { has: false, last4: null };
  return { completed, data, stepReached: draft?.stepReached ?? 0, phone, profileVersion: profile?.profileVersion ?? 0 };
}

/** Claims or changes the user's alias. Returns an error message when it is taken or reserved. */
async function claimAlias(tx: Pick<ReturnType<typeof db>, "insert">, userId: string, alias: string): Promise<string | null> {
  if (RESERVED_ALIASES.has(alias.toLowerCase())) return "That alias is not available";
  try {
    await tx
      .insert(userAliases)
      .values({ userId, alias })
      .onConflictDoUpdate({ target: userAliases.userId, set: { alias } });
    return null;
  } catch (err) {
    if (uniqueViolation(err)) return "That alias is already taken";
    throw err;
  }
}

class Abort extends Error {
  constructor(public fieldErrors: FieldErrors) {
    super("abort");
  }
}

export async function saveStep(args: {
  userId: string;
  role: Role;
  step: StepKey;
  values: unknown;
  phone?: string;
}): Promise<SaveResult> {
  const { userId, role, step } = args;
  if (step === "review" || !STEP_ORDER[role].includes(step)) return { ok: false, fieldErrors: {}, formError: "Unknown step" };
  const dataStep = step as DataStep;

  const parsed = stepSchema(role, dataStep).safeParse(normalizeEmpty(args.values));
  if (!parsed.success) return { ok: false, fieldErrors: zodFieldErrors(parsed.error) };
  let stepData = parsed.data as Record<string, unknown>;

  const state = await loadProfileState(userId, role);
  const fieldErrors: FieldErrors = {};

  if (dataStep === "availability") {
    if (args.phone) {
      if (!isAcceptablePhone(args.phone)) fieldErrors.phone = "Enter a valid number with country code";
    } else if (!state.phone.has) {
      fieldErrors.phone = "Your phone number is required";
    }
  }
  if (Object.keys(fieldErrors).length) return { ok: false, fieldErrors };

  if (dataStep === "basics") {
    const prev = state.data.basics as { consentedAt?: string } | undefined;
    stepData = { ...stepData, consentedAt: prev?.consentedAt ?? new Date().toISOString() };
  }

  try {
    await db().transaction(async (tx) => {
      if (dataStep === "basics") {
        const err = await claimAlias(tx, userId, (stepData as { alias: string }).alias);
        if (err) throw new Abort({ alias: err });
      }
      if (args.phone) await savePhone(tx, userId, args.phone);

      const t = table(role);
      if (!state.completed) {
        const merged = { ...state.data, [dataStep]: stepData };
        const reached = Math.max(state.stepReached, STEP_ORDER[role].indexOf(dataStep) + 1);
        await tx
          .insert(profileDrafts)
          .values({ userId, role, data: merged, stepReached: reached })
          .onConflictDoUpdate({ target: profileDrafts.userId, set: { data: merged, stepReached: reached, updatedAt: new Date() } });
        return;
      }

      // Completed profiles are edited in place, and the whole profile must stay valid.
      const merged = { ...state.data, [dataStep]: stepData } as Data;
      const whole = profileSchema(role).safeParse(merged);
      if (!whole.success) throw new Abort({ _: "This change would make your profile invalid" });
      const matching = isMatchingChange(state.data, merged);
      const derived = role === "seeker" ? deriveSeeker(whole.data as SeekerProfileData) : deriveGuide(whole.data as GuideProfileData);
      const version = state.profileVersion + (matching ? 1 : 0);
      await tx
        .update(t)
        .set({ data: merged, ...derived, profileVersion: version, updatedAt: new Date() } as never)
        .where(eq(t.userId, userId));
      if (matching) {
        if (role === "guide") await bumpCounter(tx, GUIDE_POOL_VERSION);
        await onProfileChanged(tx, { userId, role, profileVersion: version });
      }
    });
  } catch (err) {
    if (err instanceof Abort) return { ok: false, fieldErrors: err.fieldErrors };
    throw err;
  }
  return { ok: true };
}

/** Autosave for unfinished profiles: stored loosely (validated on Next and on Submit), never phone numbers. */
export async function autosaveDraft(args: { userId: string; role: Role; step: StepKey; values: unknown }): Promise<{ ok: boolean }> {
  const { userId, role, step } = args;
  if (step === "review" || !STEP_ORDER[role].includes(step)) return { ok: false };
  const state = await loadProfileState(userId, role);
  if (state.completed) return { ok: false };
  const values = normalizeEmpty(args.values);
  if (!values || typeof values !== "object" || Array.isArray(values)) return { ok: false };
  const copy = { ...(values as Record<string, unknown>) };
  delete copy.phone;
  if (JSON.stringify(copy).length > MAX_DRAFT_BYTES) return { ok: false };
  // The alias is only claimed by an explicit Next, so autosave must not hold names hostage.
  const merged = { ...state.data, [step]: copy };
  await db()
    .insert(profileDrafts)
    .values({ userId, role, data: merged, stepReached: state.stepReached })
    .onConflictDoUpdate({ target: profileDrafts.userId, set: { data: merged, updatedAt: new Date() } });
  return { ok: true };
}

export async function submitProfile(args: { userId: string; role: Role }): Promise<SubmitResult> {
  const { userId, role } = args;
  const state = await loadProfileState(userId, role);
  if (state.completed) return { ok: true };

  const whole = profileSchema(role).safeParse(state.data);
  if (!whole.success) {
    const first = whole.error.issues[0]!;
    const step = String(first.path[0]) as StepKey;
    const fieldErrors = zodFieldErrors(whole.error);
    return { ok: false, step: STEP_ORDER[role].includes(step) ? step : STEP_ORDER[role][0]!, fieldErrors: stripPrefix(fieldErrors, step) };
  }
  if (role === "guide" && !state.phone.has) {
    return { ok: false, step: "availability", fieldErrors: { phone: "Your phone number is required" } };
  }

  await db().transaction(async (tx) => {
    const t = table(role);
    const derived = role === "seeker" ? deriveSeeker(whole.data as SeekerProfileData) : deriveGuide(whole.data as GuideProfileData);
    const values = { data: whole.data as Record<string, unknown>, ...derived, profileVersion: 1, profileCompletedAt: new Date() };
    await tx
      .insert(t)
      .values({ userId, ...values } as never)
      .onConflictDoUpdate({ target: t.userId, set: { ...values, updatedAt: new Date() } as never });
    await tx.delete(profileDrafts).where(eq(profileDrafts.userId, userId));
    if (role === "guide") await bumpCounter(tx, GUIDE_POOL_VERSION);
    await onProfileChanged(tx, { userId, role, profileVersion: 1 });
  });
  return { ok: true };
}

function stripPrefix(errors: FieldErrors, step: string): FieldErrors {
  const out: FieldErrors = {};
  for (const [k, v] of Object.entries(errors)) if (k.startsWith(`${step}.`)) out[k.slice(step.length + 1)] = v;
  return out;
}

export async function suggestFreeAlias(generate: () => string): Promise<string> {
  for (let i = 0; i < 12; i++) {
    const alias = generate();
    const rows = await db().select({ id: userAliases.userId }).from(userAliases).where(eq(userAliases.alias, alias)).limit(1);
    if (!rows.length) return alias;
  }
  return `${generate()}${Math.floor(Math.random() * 900) + 100}`.slice(0, 24);
}
