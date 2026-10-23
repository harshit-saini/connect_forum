import "server-only";
import { eq } from "drizzle-orm";
import type { ZodError } from "zod";
import { normalizeEmpty } from "@/schemas/common";
import { formSchema, type GuideProfileData, type Role, type SeekerProfileData } from "@/schemas";
import { db } from "@/server/db/client";
import { guideProfiles, seekerProfiles, userAliases, userRoles } from "@/server/db/schema";
import { isKnownMemberId } from "@/server/members";
import { deriveGuide, deriveSeeker, isMatchingChange } from "./derive";
import { bumpCounter, GUIDE_POOL_VERSION } from "./counters";
import { onProfileChanged } from "./hooks";
import { isAcceptablePhone, phoneStatus, savePhone } from "./phone";

export type FieldErrors = Record<string, string>;
export type SaveResult = { ok: true; created: boolean } | { ok: false; fieldErrors: FieldErrors; formError?: string };

const RESERVED_ALIASES = new Set(["admin", "administrator", "support", "moderator", "connect", "system", "staff", "help", "official"]);

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

function uniqueViolation(err: unknown): string | null {
  const e = err as { code?: string; constraint?: string; cause?: { code?: string; constraint?: string } };
  const code = e?.code ?? e?.cause?.code;
  return code === "23505" ? (e?.constraint ?? e?.cause?.constraint ?? "unique") : null;
}

/** The saved profile of a user, or an empty state. Legacy rows (no member ID) count as not registered. */
export async function loadProfileState(userId: string, role: Role) {
  const t = table(role);
  const [profile] = await db().select().from(t).where(eq(t.userId, userId)).limit(1);
  const [alias] = await db().select().from(userAliases).where(eq(userAliases.userId, userId)).limit(1);
  const completed = Boolean(profile?.profileCompletedAt && profile.memberId);
  const data = (completed ? structuredClone(profile!.data) : {}) as Record<string, unknown>;
  if (alias) data.alias = alias.alias;
  const phone = role === "guide" ? await phoneStatus(db(), userId) : { has: false, last4: null };
  return { completed, data, memberId: completed ? profile!.memberId : null, phone, profileVersion: profile?.profileVersion ?? 0 };
}

class Abort extends Error {
  constructor(public fieldErrors: FieldErrors) {
    super("abort");
  }
}

/**
 * Registers a new profile or updates the existing one from the single-page form.
 *
 *  - The member ID must be on the allow-list for the role (hard check) and can't be changed afterwards.
 *  - A user keeps the one role they registered with; the role comes from the link they used.
 *  - Guides must supply a phone number once; it goes to the encrypted vault, never into `data`.
 */
export async function saveProfile(args: { userId: string; role: Role; values: unknown; phone?: string }): Promise<SaveResult> {
  const { userId, role } = args;
  const raw = (args.values ?? {}) as Record<string, unknown>;
  const state = await loadProfileState(userId, role);

  // Registered members cannot change their ID: their stored one is used whatever the form says.
  const input = normalizeEmpty({ ...raw, ...(state.memberId ? { memberId: state.memberId } : {}) });
  const parsed = formSchema(role).safeParse(input);
  const fieldErrors: FieldErrors = parsed.success ? {} : zodFieldErrors(parsed.error);

  if (parsed.success && !state.memberId && !isKnownMemberId(role, parsed.data.memberId)) {
    fieldErrors.memberId = "We couldn't find that member ID. Check it and try again.";
  }
  if (role === "guide") {
    if (args.phone) {
      if (!isAcceptablePhone(args.phone)) fieldErrors.phone = "Enter a valid number with country code";
    } else if (!state.phone.has) {
      fieldErrors.phone = "Your phone number is required";
    }
  }
  if (!parsed.success || Object.keys(fieldErrors).length) return { ok: false, fieldErrors };

  const { memberId, agree: _agree, ...answers } = parsed.data as { memberId: string; agree: true } & Record<string, unknown>;
  void _agree;
  const alias = (answers as { alias: string }).alias;
  if (RESERVED_ALIASES.has(alias.toLowerCase())) return { ok: false, fieldErrors: { alias: "That alias is not available" } };

  const prev = state.data as { consentedAt?: string };
  const data = { ...answers, consentedAt: prev.consentedAt ?? new Date().toISOString() } as Record<string, unknown>;
  const derived = role === "seeker" ? deriveSeeker(data as unknown as SeekerProfileData) : deriveGuide(data as unknown as GuideProfileData);

  try {
    await db().transaction(async (tx) => {
      // One role per account.
      const [existing] = await tx.select().from(userRoles).where(eq(userRoles.userId, userId));
      if (existing && existing.role !== role) throw new Abort({ _: `This account is registered as a ${existing.role === "guide" ? "Guide" : "Seeker"}.` });
      if (!existing) await tx.insert(userRoles).values({ userId, role });

      await tx.insert(userAliases).values({ userId, alias }).onConflictDoUpdate({ target: userAliases.userId, set: { alias } });
      if (args.phone) await savePhone(tx, userId, args.phone);

      const t = table(role);
      const [row] = await tx.select({ version: t.profileVersion }).from(t).where(eq(t.userId, userId));
      const before = state.completed ? (state.data as Record<string, unknown>) : undefined;
      const matching = !state.completed || isMatchingChange(before, data);
      const version = (row?.version ?? 0) + (matching ? 1 : 0);
      const values = { data, ...derived, memberId, profileVersion: Math.max(version, 1), profileCompletedAt: state.completed ? undefined : new Date() };
      await tx
        .insert(t)
        .values({ userId, ...values } as never)
        .onConflictDoUpdate({ target: t.userId, set: { ...values, updatedAt: new Date() } as never });

      if (matching) {
        if (role === "guide") await bumpCounter(tx, GUIDE_POOL_VERSION);
        await onProfileChanged(tx, { userId, role, profileVersion: Math.max(version, 1) });
      }
    });
  } catch (err) {
    if (err instanceof Abort) return { ok: false, fieldErrors: err.fieldErrors };
    const violated = uniqueViolation(err);
    if (violated) {
      if (violated.includes("member_id")) return { ok: false, fieldErrors: { memberId: "This member ID is already registered." } };
      return { ok: false, fieldErrors: { alias: "That alias is already taken" } };
    }
    throw err;
  }
  return { ok: true, created: !state.completed };
}

export async function suggestFreeAlias(generate: () => string): Promise<string> {
  for (let i = 0; i < 12; i++) {
    const alias = generate();
    const rows = await db().select({ id: userAliases.userId }).from(userAliases).where(eq(userAliases.alias, alias)).limit(1);
    if (!rows.length) return alias;
  }
  return `${generate()}${Math.floor(Math.random() * 900) + 100}`.slice(0, 24);
}
