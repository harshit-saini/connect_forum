import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const metadata = { title: "Join" };

export default function JoinChooser() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 pt-8">
      <h1 className="text-3xl font-semibold">How would you like to join?</h1>
      <p className="text-muted">You&apos;ll need your member ID.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">I need guidance</h2>
          <p className="flex-1 text-sm text-muted">Ask your career question and get matched with an experienced Guide.</p>
          <Link href="/join/seeker" className={buttonVariants()}>Join as a Seeker</Link>
        </Card>
        <Card className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">I want to guide others</h2>
          <p className="flex-1 text-sm text-muted">Share your experience. Guides usually join from the email invitation.</p>
          <Link href="/join/guide" className={buttonVariants({ variant: "outline" })}>Join as a Guide</Link>
        </Card>
      </div>
    </div>
  );
}
