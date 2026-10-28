import Link from "next/link";
import { requireViewer } from "@/server/viewer";
import { SignOutButton } from "@/components/sign-out-button";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Members without a role yet (e.g. an admin who never registered) can still reach /admin and /settings.
  const viewer = await requireViewer();
  return (
    <>
      <header className="border-b border-border bg-card">
        <nav aria-label="Main" className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/dashboard" className="text-lg font-semibold">Connect</Link>
          <div className="flex items-center gap-4 text-sm">
            {viewer.role && <span className="hidden rounded-full bg-accent px-2.5 py-0.5 capitalize sm:inline">{viewer.role}</span>}
            {viewer.isAdmin && <Link href="/admin" className="hover:underline">Admin</Link>}
            <Link href="/settings" className="hover:underline">Settings</Link>
            <SignOutButton />
          </div>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
    </>
  );
}
