import Link from "next/link";
import { redirect } from "next/navigation";
import { FindGuides } from "@/components/matches/find-guides";
import { getRunView, latestRunId } from "@/server/matching/view";
import { requireCompletedProfile } from "@/server/viewer";

export const metadata = { title: "Seeker dashboard" };

export default async function SeekerDashboard() {
  const viewer = await requireCompletedProfile();
  if (viewer.role !== "seeker") redirect("/dashboard");
  const runId = await latestRunId(viewer.id);
  const initial = runId ? await getRunView(runId, viewer.id) : null;
  return (
    <div className="space-y-8">
      <div className="flex items-baseline justify-between">
        <h1 className="text-3xl font-semibold">Seeker dashboard</h1>
        <Link href="/profile" className="text-sm underline">My profile</Link>
      </div>
      <FindGuides initial={initial} />
    </div>
  );
}
