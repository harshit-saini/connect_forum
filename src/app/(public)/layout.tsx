import Link from "next/link";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-4">
        <Link href="/" className="text-lg font-semibold">
          Connect
        </Link>
        <Link href="/sign-in" className="text-sm font-medium underline-offset-4 hover:underline">
          Sign in
        </Link>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-16">{children}</main>
      <footer className="border-t border-border py-6 text-center text-sm text-muted">
        <Link href="/terms" className="mx-3 hover:underline">Terms</Link>
        <Link href="/privacy" className="mx-3 hover:underline">Privacy</Link>
      </footer>
    </>
  );
}
