"use server";
import { redirect } from "next/navigation";
import { generateAlias } from "@/lib/alias";
import type { StepKey } from "@/schemas";
import { autosaveDraft, saveStep, submitProfile, suggestFreeAlias, type SaveResult, type SubmitResult } from "@/server/profile/service";
import { kickWorker } from "@/server/jobs/kick";
import { dashboardPath, requireRole } from "@/server/viewer";

export async function saveStepAction(step: StepKey, values: unknown, phone?: string): Promise<SaveResult> {
  const viewer = await requireRole();
  const result = await saveStep({ userId: viewer.id, role: viewer.role, step, values, phone: phone || undefined });
  if (result.ok) kickWorker();
  return result;
}

export async function autosaveAction(step: StepKey, values: unknown): Promise<{ ok: boolean }> {
  const viewer = await requireRole();
  return autosaveDraft({ userId: viewer.id, role: viewer.role, step, values });
}

export async function submitProfileAction(): Promise<SubmitResult> {
  const viewer = await requireRole();
  const result = await submitProfile({ userId: viewer.id, role: viewer.role });
  if (result.ok) {
    kickWorker();
    redirect(dashboardPath(viewer.role));
  }
  return result;
}

export async function suggestAliasAction(): Promise<string> {
  await requireRole();
  return suggestFreeAlias(generateAlias);
}
