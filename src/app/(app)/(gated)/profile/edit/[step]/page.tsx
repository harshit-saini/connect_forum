import { notFound } from "next/navigation";
import { EditStep } from "./edit-step";
import { STEP_ORDER, type StepKey } from "@/schemas";
import { loadProfileState } from "@/server/profile/service";
import { requireCompletedProfile } from "@/server/viewer";

export const metadata = { title: "Edit profile" };

export default async function EditPage({ params }: { params: Promise<{ step: string }> }) {
  const viewer = await requireCompletedProfile();
  const { step } = await params;
  if (step === "review" || !STEP_ORDER[viewer.role].includes(step as StepKey)) notFound();
  const state = await loadProfileState(viewer.id, viewer.role);
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <p className="rounded-lg bg-accent p-3 text-sm">Changes to matching-related answers refresh your matches the next time someone searches.</p>
      <EditStep role={viewer.role} step={step as Exclude<StepKey, "review">} data={state.data} phone={state.phone} />
    </div>
  );
}
