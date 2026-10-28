import Link from "next/link";
import { SignOutButton } from "@/components/sign-out-button";
import { dashboardPath, getViewer } from "@/server/viewer";

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer();
  return (
    <>
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-4">
        <Link href="/" className="text-lg font-semibold">
          Connect
        </Link>
        {viewer ? (
          <div className="flex items-center gap-4 text-sm font-medium">
            <Link href={dashboardPath(viewer.role)} className="underline-offset-4 hover:underline">Dashboard</Link>
            <SignOutButton />
          </div>
        ) : (
          <Link href="/sign-in" className="text-sm font-medium underline-offset-4 hover:underline">
            Sign in
          </Link>
        )}
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-16">{children}</main>
      <footer className="border-t border-border py-6 text-center text-sm text-muted">
        <Link href="/terms" className="mx-3 hover:underline">Terms</Link>
        <Link href="/privacy" className="mx-3 hover:underline">Privacy</Link>
      </footer>
    </>
  );
}
