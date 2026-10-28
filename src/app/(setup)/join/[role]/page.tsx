import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { JoinForm } from "@/components/join/join-form";
import { SignOutButton } from "@/components/sign-out-button";
import { Card } from "@/components/ui/card";
import { env } from "@/server/env";
import { loadProfileState } from "@/server/profile/service";
import { dashboardPath, requireViewer, type Role } from "@/server/viewer";

export const metadata = { title: "Join" };

const COPY: Record<Role, { title: string; intro: string }> = {
  seeker: { title: "Ask for guidance", intro: "A few quick details and your question. You stay anonymous until a Guide agrees to talk." },
  guide: { title: "Register as a Guide", intro: "A short profile is all we need. Seekers see only your role, categories and experience until you approve a request." },
};

/** The link members use to register: /join/seeker (shared on the website) and /join/guide (sent by email). */
export default async function JoinPage({ params }: { params: Promise<{ role: string }> }) {
  const { role } = await params;
  if (role !== "seeker" && role !== "guide") notFound();
  const viewer = await requireViewer();
  if (viewer.role && viewer.role !== role && viewer.profileCompleted) {
    // Registered with the other role: don't redirect (that hid the form they asked for).
    const other = viewer.role === "guide" ? "Guide" : "Seeker";
    return (
      <Card className="space-y-4">
        <h1 className="text-2xl font-semibold">This email is already registered as a {other}</h1>
        <p className="text-muted">An email address can have one role. Go to your dashboard, or sign out and use a different email address to register as a {role === "guide" ? "Guide" : "Seeker"}.</p>
        <div className="flex flex-wrap items-center gap-4">
          <Link href={dashboardPath(viewer.role)} className="font-medium text-primary underline-offset-4 hover:underline">Go to my dashboard</Link>
          <SignOutButton className="text-sm underline" />
        </div>
      </Card>
    );
  }
  if (viewer.role === role && viewer.profileCompleted) redirect(dashboardPath(role));

  const state = await loadProfileState(viewer.id, role);
  const { title, intro } = COPY[role];
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">{title}</h1>
        <p className="mt-1 text-muted">{intro}</p>
      </div>
      <JoinForm role={role} initial={{}} memberId={null} phone={state.phone} aiProcessing={env().AI_ENABLED} />
    </div>
  );
}
