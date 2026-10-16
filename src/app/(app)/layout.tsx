import Link from "next/link";
import { requireRole } from "@/server/viewer";
import { SignOutButton } from "./sign-out-button";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireRole();
  return (
    <>
      <header className="border-b border-border bg-card">
        <nav aria-label="Main" className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/dashboard" className="text-lg font-semibold">Connect</Link>
          <div className="flex items-center gap-4 text-sm">
            <span className="hidden rounded-full bg-accent px-2.5 py-0.5 capitalize sm:inline">{viewer.role}</span>
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
