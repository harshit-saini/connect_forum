"use client";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col justify-center gap-4 px-4 py-16">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="text-muted">We couldn&apos;t load this page. Nothing you entered has been lost. Please try again.</p>
      {error.digest && <p className="text-xs text-muted">Reference: {error.digest}</p>}
      <div className="flex gap-3">
        <Button onClick={reset}>Try again</Button>
        <Link href="/" className={buttonVariants({ variant: "outline" })}>Go home</Link>
      </div>
    </main>
  );
}
