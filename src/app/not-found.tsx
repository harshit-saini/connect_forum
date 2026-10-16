import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export const metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col justify-center gap-4 px-4 py-16">
      <h1 className="text-2xl font-semibold">We couldn&apos;t find that page</h1>
      <p className="text-muted">The link may be old, or the page may have moved.</p>
      <div><Link href="/" className={buttonVariants()}>Go home</Link></div>
    </main>
  );
}
