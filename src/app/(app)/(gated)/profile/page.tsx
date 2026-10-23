import Link from "next/link";
import { ProfileView } from "@/components/profile/profile-view";
import { buttonVariants } from "@/components/ui/button";
import { loadProfileState } from "@/server/profile/service";
import { requireCompletedProfile } from "@/server/viewer";

export const metadata = { title: "My profile" };

export default async function ProfilePage() {
  const viewer = await requireCompletedProfile();
  const state = await loadProfileState(viewer.id, viewer.role);
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-3xl font-semibold">My profile</h1>
        <Link href={viewer.role === "guide" ? "/guide" : "/seeker"} className="text-sm underline">Dashboard</Link>
      </div>
      <ProfileView role={viewer.role} data={state.data} memberId={state.memberId} phone={state.phone} />
      <Link href="/profile/edit" className={buttonVariants({ variant: "outline" })}>Edit profile</Link>
    </div>
  );
}
