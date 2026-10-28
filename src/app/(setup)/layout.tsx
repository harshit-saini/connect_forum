import Link from "next/link";
import { SignOutButton } from "@/components/sign-out-button";
import { getViewer } from "@/server/viewer";

export default async function SetupLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer();
  return (
    <>
      <header className="mx-auto flex w-full max-w-2xl items-center justify-between px-4 py-4">
        <Link href="/" className="text-lg font-semibold">Connect</Link>
        {viewer && (
          <div className="flex items-center gap-4 text-sm">
            <span className="hidden text-muted sm:inline">{viewer.email}</span>
            <SignOutButton />
          </div>
        )}
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-16">{children}</main>
    </>
  );
}
