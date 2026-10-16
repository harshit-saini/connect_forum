import Link from "next/link";
import { AnonymousCard } from "@/components/wizard/anonymous-card";
import { ProfileSummary } from "@/components/wizard/profile-summary";
import { loadProfileState } from "@/server/profile/service";
import { requireCompletedProfile } from "@/server/viewer";

export const metadata = { title: "My profile" };

export default async function ProfilePage() {
  const viewer = await requireCompletedProfile();
  const state = await loadProfileState(viewer.id, viewer.role);
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div className="flex items-baseline justify-between">
        <h1 className="text-3xl font-semibold">My profile</h1>
        <Link href={viewer.role === "guide" ? "/guide" : "/seeker"} className="text-sm underline">Dashboard</Link>
      </div>
      <section aria-labelledby="card">
        <h2 id="card" className="mb-3 text-xl font-semibold">What others see</h2>
        <AnonymousCard role={viewer.role} data={state.data} />
      </section>
      <section aria-labelledby="answers">
        <h2 id="answers" className="mb-3 text-xl font-semibold">Your answers</h2>
        <ProfileSummary role={viewer.role} data={state.data} phone={state.phone} editHref={(s) => `/profile/edit/${s}`} />
      </section>
    </div>
  );
}
