import { redirect } from "next/navigation";
import { dashboardPath, requireRole } from "@/server/viewer";

export const metadata = { title: "Complete your profile" };

export default async function Onboarding() {
  const viewer = await requireRole();
  if (viewer.profileCompleted) redirect(dashboardPath(viewer.role));
  return (
    <div className="space-y-2">
      <h1 className="text-3xl font-semibold">Complete your profile</h1>
      <p className="text-muted">The profile wizard arrives in the next milestone.</p>
    </div>
  );
}
