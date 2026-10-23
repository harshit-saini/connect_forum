"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { inviteGuides, reviewReport, suspendUser, unsuspendUser, type InviteResult } from "@/server/admin/service";
import { rateLimit } from "@/server/ratelimit";
import { requireAdmin } from "@/server/viewer";

const id = z.uuid();

// Every admin action re-checks the admin role on the server: hiding a button is never the protection.
export async function suspendUserAction(formData: FormData) {
  const admin = await requireAdmin();
  const userId = id.parse(formData.get("userId"));
  await suspendUser({ adminId: admin.id, userId, reason: String(formData.get("reason") ?? "") || undefined });
  revalidatePath("/admin/users");
  revalidatePath("/admin/reports");
}

export async function unsuspendUserAction(formData: FormData) {
  const admin = await requireAdmin();
  await unsuspendUser({ adminId: admin.id, userId: id.parse(formData.get("userId")) });
  revalidatePath("/admin/users");
  revalidatePath("/admin/reports");
}

export async function reviewReportAction(formData: FormData) {
  const admin = await requireAdmin();
  const outcome = z.enum(["reviewed", "dismissed"]).parse(formData.get("outcome"));
  await reviewReport(admin.id, id.parse(formData.get("reportId")), outcome);
  revalidatePath("/admin/reports");
  revalidatePath("/admin");
}

export async function inviteGuidesAction(_prev: InviteResult | null, formData: FormData): Promise<InviteResult> {
  const admin = await requireAdmin();
  const limited = await rateLimit(`guide_invites:${admin.id}`, 10, 3600);
  if (!limited.allowed) return { ok: false, message: "Too many invitation batches. Please wait a while." };
  return inviteGuides(admin.id, String(formData.get("emails") ?? "").slice(0, 5000));
}
