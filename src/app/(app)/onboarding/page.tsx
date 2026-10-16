import { redirect } from "next/navigation";
import { Wizard } from "@/components/wizard/wizard";
import { STEP_ORDER, type StepKey } from "@/schemas";
import { loadProfileState } from "@/server/profile/service";
import { dashboardPath, requireRole } from "@/server/viewer";

export const metadata = { title: "Complete your profile" };

export default async function Onboarding({ searchParams }: { searchParams: Promise<{ step?: string }> }) {
  const viewer = await requireRole();
  if (viewer.profileCompleted) redirect(dashboardPath(viewer.role));
  const state = await loadProfileState(viewer.id, viewer.role);
  const order = STEP_ORDER[viewer.role];

  // Users can revisit any step they've already saved, plus the next one; never skip ahead.
  const furthest = Math.min(state.stepReached, order.length - 1);
  const { step } = await searchParams;
  const requested = order.indexOf(step as StepKey);
  const index = requested >= 0 && requested <= furthest ? requested : furthest;

  return (
    <div className="mx-auto max-w-2xl space-y-2">
      <h1 className="text-3xl font-semibold">Your career profile</h1>
      <p className="pb-4 text-muted">Takes about 10 minutes. Your progress is saved automatically, so you can come back any time.</p>
      <Wizard role={viewer.role} step={order[index]!} data={state.data} phone={state.phone} />
    </div>
  );
}
