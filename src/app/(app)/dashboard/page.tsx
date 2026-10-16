import { redirect } from "next/navigation";
import { dashboardPath, requireRole } from "@/server/viewer";

export default async function Dashboard() {
  const viewer = await requireRole();
  redirect(viewer.profileCompleted ? dashboardPath(viewer.role) : "/onboarding");
}
