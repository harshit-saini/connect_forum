"use server";
import { redirect } from "next/navigation";
import type { Role } from "@/schemas";
import { kickWorker } from "@/server/jobs/kick";
import { saveProfile, type FieldErrors } from "@/server/profile/service";
import { rateLimit } from "@/server/ratelimit";
import { dashboardPath, requireViewer } from "@/server/viewer";

export type SubmitResult = { ok: false; fieldErrors: FieldErrors } | { ok: true };

/** Registers (or updates) the signed-in user's profile from the single-page form, then goes to the dashboard. `removePhone` deletes a Guide's saved number. */
export async function saveProfileAction(role: Role, values: unknown, phone?: string, removePhone?: boolean): Promise<SubmitResult> {
  const viewer = await requireViewer();
  if (role !== "seeker" && role !== "guide") return { ok: false, fieldErrors: { _: "Unknown role" } };
  // The member-ID check must not become a way to guess valid IDs.
  const limited = await rateLimit(`profile_save:${viewer.id}`, 30, 3600);
  if (!limited.allowed) return { ok: false, fieldErrors: { _: "Too many attempts. Please wait a while and try again." } };
  const result = await saveProfile({ userId: viewer.id, role, values, phone: phone || undefined, removePhone: removePhone === true });
  if (!result.ok) return { ok: false, fieldErrors: result.formError ? { ...result.fieldErrors, _: result.formError } : result.fieldErrors };
  kickWorker();
  redirect(dashboardPath(role));
}
