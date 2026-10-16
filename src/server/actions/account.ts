"use server";
import { redirect } from "next/navigation";
import { deleteAccount } from "@/server/account";
import { rateLimit } from "@/server/ratelimit";
import { requireViewer } from "@/server/viewer";

export type DeleteState = { error?: string };

export async function deleteAccountAction(_prev: DeleteState, formData: FormData): Promise<DeleteState> {
  const viewer = await requireViewer();
  if (String(formData.get("confirm") ?? "").trim() !== "DELETE") return { error: "Type DELETE to confirm." };
  if (!(await rateLimit(`delete_account:${viewer.id}`, 3, 3600)).allowed) return { error: "Too many attempts. Please try again later." };
  if (!(await deleteAccount(viewer.id))) return { error: "Your account could not be found." };
  redirect("/?deleted=1");
}
