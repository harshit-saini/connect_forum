import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const steps = [
  ["Tell us your question", "A one-page form with your member ID. You appear only under an alias you choose."],
  ["Get quick answers, then a match", "Common questions are answered first. If you still need help, we match you with a Guide and explain why."],
  ["Guide approves", "A Guide sees your anonymous request and decides. No approval, no contact."],
  ["Talk directly", "After approval you see the Guide's number in the portal and contact them yourself. Then rate the experience."],
];

export default async function Landing({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const { deleted } = await searchParams;
  return (
    <div className="space-y-14 pt-8 sm:pt-16">
      {deleted && (
        <p role="status" className="rounded-lg border border-border bg-accent px-4 py-3 text-sm">Your account and data have been deleted.</p>
      )}
      <section className="max-w-2xl space-y-5">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Career guidance from people who have been there.</h1>
        <p className="text-lg text-muted">
          Connect matches job seekers with experienced professionals. Everyone stays anonymous until a Guide approves
          a connection.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href="/join/seeker" className={buttonVariants({ className: "px-6" })}>
            I need guidance
          </Link>
          <Link href="/join/guide" className={buttonVariants({ variant: "outline", className: "px-6" })}>
            I want to guide others
          </Link>
          <Link href="/faq" className={buttonVariants({ variant: "ghost", className: "px-6" })}>
            Read the FAQs
          </Link>
        </div>
      </section>

      <section aria-labelledby="how" className="space-y-4">
        <h2 id="how" className="text-2xl font-semibold">How it works</h2>
        <ol className="grid gap-4 sm:grid-cols-2">
          {steps.map(([title, body], i) => (
            <li key={title}>
              <Card className="h-full">
                <span className="text-sm font-medium text-primary">Step {i + 1}</span>
                <h3 className="mt-1 text-lg font-semibold">{title}</h3>
                <p className="mt-1 text-muted">{body}</p>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="privacy" className="rounded-2xl bg-accent p-6 sm:p-8">
        <h2 id="privacy" className="text-2xl font-semibold">Our privacy promise</h2>
        <ul className="mt-3 list-disc space-y-1.5 pl-5">
          <li>Only aliases are visible. No real names, photos, age, gender or religion are collected.</li>
          <li>A Guide&apos;s phone number is encrypted and shown only to a Seeker that Guide approved.</li>
          <li>We never relay messages. Conversations happen outside the portal, on your terms.</li>
          <li>You can export or delete your data at any time.</li>
        </ul>
      </section>
    </div>
  );
}
