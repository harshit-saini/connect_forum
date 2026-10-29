import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { matchingCopy } from "@/lib/branding";
import { env } from "@/server/env";

const baseSteps = [
  ["Tell us your question", "A one-page form with your member ID. Others never see your name, only your category and experience."],
  null, // replaced by the matching step (see matchingCopy)
  ["Connect", "Press “I want to connect” on a match. There is no approval step: we email you the Guide's profile details straight away, plus their email address and phone number if they chose to share them. The Guide is told someone connected and gets your email address."],
  ["Talk directly", "Write to the Guide (or call, if they shared a number) yourself, outside the portal. Then rate the experience."],
];

export default async function Landing({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const { deleted } = await searchParams;
  const steps = baseSteps.map((s) => s ?? matchingCopy(env().AI_BRANDING).landingMatch);
  return (
    <div className="space-y-14 pt-8 sm:pt-16">
      {deleted && (
        <p role="status" className="rounded-lg border border-border bg-accent px-4 py-3 text-sm">Your account and data have been deleted.</p>
      )}
      <section className="max-w-2xl space-y-5">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Career guidance from people who have been there.</h1>
        <p className="text-lg text-muted">
          Connect matches job seekers with experienced professionals. Guides never see a Seeker&apos;s name. When
          a Seeker connects, the Seeker&apos;s email address is shared with that Guide so they can write to each other. A Guide chooses whether to share their own email address and a phone number.
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
          <li>A Seeker&apos;s name and phone number are never shown to a Guide. No real names, photos, age, gender or religion are collected.</li>
          <li>When a Seeker connects with a Guide, the Seeker&apos;s email address is shared with that Guide. A Guide&apos;s email address is shared with the Seeker only if the Guide opted in, and can be switched off at any time.</li>
          <li>A Guide&apos;s phone number is optional. If a Guide adds one, it is stored encrypted and emailed to Seekers who connect with them. A Guide can remove it at any time.</li>
          <li>We never relay messages. Conversations happen outside the portal, on your terms.</li>
          <li>You can export or delete your data at any time.</li>
        </ul>
      </section>
    </div>
  );
}
