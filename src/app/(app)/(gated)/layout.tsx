import { requireCompletedProfile } from "@/server/viewer";

// The onboarding gate. Every page under this group needs a completed profile; only /onboarding,
// /settings and sign-out live outside it.
export default async function GatedLayout({ children }: { children: React.ReactNode }) {
  await requireCompletedProfile();
  return children;
}
