import "server-only";
import { eq, sql } from "drizzle-orm";
import type { ZodError } from "zod";
import { normalizeEmpty } from "@/schemas/common";
import { formSchema, type GuideProfileData, type Role, type SeekerProfileData } from "@/schemas";
import { db } from "@/server/db/client";
import { guideProfiles, seekerProfiles, userRoles } from "@/server/db/schema";
import { isKnownMemberId } from "@/server/members";
import { deriveGuide, deriveSeeker, isMatchingChange } from "./derive";
import { bumpCounter, GUIDE_POOL_VERSION } from "./counters";
import { onProfileChanged } from "./hooks";
import { deletePhone, isAcceptablePhone, phoneStatus, savePhone } from "./phone";

export type FieldErrors = Record<string, string>;
export type SaveResult = { ok: true; created: boolean } | { ok: false; fieldErrors: FieldErrors; formError?: string };

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
  const completed = Boolean(profile?.profileCompletedAt && profile.memberId);
  const data = (completed ? structuredClone(profile!.data) : {}) as Record<string, unknown>;
  delete data.alias; // legacy: aliases no longer exist, and old rows still carry one
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
 *  - One completed role per account; the role comes from the link they used. An unfinished profile of the other role is dropped.
 *  - A Guide's phone number is optional. When given it goes to the encrypted vault (never into `data`) and is
 *    e-mailed to Seekers who connect. `removePhone` deletes the saved one; a number given in the same save wins.
 */
export async function saveProfile(args: { userId: string; role: Role; values: unknown; phone?: string; removePhone?: boolean }): Promise<SaveResult> {
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
  if (role === "guide" && args.phone && !isAcceptablePhone(args.phone)) fieldErrors.phone = "Enter a valid number with country code";
  if (!parsed.success || Object.keys(fieldErrors).length) return { ok: false, fieldErrors };

  const { memberId, agree: _agree, ...answers } = parsed.data as { memberId: string; agree: true } & Record<string, unknown>;
  void _agree;

  const prev = state.data as { consentedAt?: string };
  const data = { ...answers, consentedAt: prev.consentedAt ?? new Date().toISOString() } as Record<string, unknown>;
  const derived = role === "seeker" ? deriveSeeker(data as unknown as SeekerProfileData) : deriveGuide(data as unknown as GuideProfileData);

  try {
    await db().transaction(async (tx) => {
      // Serialise saves for one account, so two tabs can't both pass the role check below.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);
      // One completed role per account. A stale role row (profile never completed) is replaced.
      const [existing] = await tx.select().from(userRoles).where(eq(userRoles.userId, userId));
      if (existing && existing.role !== role) {
        const other = table(existing.role);
        const [otherProfile] = await tx.select().from(other).where(eq(other.userId, userId)).limit(1);
        if (otherProfile?.profileCompletedAt && otherProfile.memberId) {
          throw new Abort({ _: `This email is already registered as a ${existing.role === "guide" ? "Guide" : "Seeker"}. Use a different email address.` });
        }
        await tx.delete(userRoles).where(eq(userRoles.userId, userId));
        await tx.insert(userRoles).values({ userId, role });
      } else if (!existing) {
        await tx.insert(userRoles).values({ userId, role });
      }

      if (role === "guide") {
        if (args.phone) await savePhone(tx, userId, args.phone);
        else if (args.removePhone) await deletePhone(tx, userId);
      }

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
    if (violated) return { ok: false, fieldErrors: { memberId: "This member ID is already registered." } };
    throw err;
  }
  return { ok: true, created: !state.completed };
}
