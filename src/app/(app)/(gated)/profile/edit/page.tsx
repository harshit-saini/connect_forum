import { JoinForm } from "@/components/join/join-form";
import { env } from "@/server/env";
import { loadProfileState } from "@/server/profile/service";
import { requireCompletedProfile } from "@/server/viewer";

export const metadata = { title: "Edit profile" };

export default async function EditProfilePage() {
  const viewer = await requireCompletedProfile();
  const state = await loadProfileState(viewer.id, viewer.role);
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-3xl font-semibold">Edit profile</h1>
      <p className="rounded-lg bg-accent p-3 text-sm">Changes to your question, categories or experience refresh your matches the next time someone searches.</p>
      <JoinForm role={viewer.role} initial={state.data} memberId={state.memberId} phone={state.phone} aiProcessing={env().AI_ENABLED} />
    </div>
  );
}
