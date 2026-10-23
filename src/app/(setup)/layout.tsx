import Link from "next/link";

export default function SetupLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="mx-auto flex w-full max-w-2xl items-center px-4 py-4">
        <Link href="/" className="text-lg font-semibold">Connect</Link>
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-16">{children}</main>
    </>
  );
}
