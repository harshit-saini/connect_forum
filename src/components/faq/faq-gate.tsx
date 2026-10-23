"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { Faq } from "@/config/faqs";
import { recordFaqOutcomeAction } from "@/server/actions/faq";
import { FaqList } from "./faq-list";

/**
 * Shown to a Seeker before their first search: answers for their category first, so that only the
 * questions that remain go to Guides. Once they choose "I still need a Guide" the matching UI appears.
 */
export function FaqGate({ categoryLabel, faqs, children }: { categoryLabel: string; faqs: Faq[]; children: React.ReactNode }) {
  const [state, setState] = useState<"gate" | "resolved" | "escalated">("gate");
  const [pending, start] = useTransition();

  function choose(outcome: "resolved" | "escalated") {
    start(async () => {
      await recordFaqOutcomeAction(outcome).catch(() => undefined);
      setState(outcome);
    });
  }

  if (state === "escalated") return <>{children}</>;
  if (state === "resolved") {
    return (
      <Card className="space-y-3" role="status">
        <h2 className="text-xl font-semibold">Glad that helped</h2>
        <p className="text-sm text-muted">If something else comes up, you can still ask a Guide at any time.</p>
        <Button variant="outline" onClick={() => setState("escalated")}>Find a Guide anyway</Button>
      </Card>
    );
  }
  return (
    <section aria-labelledby="faq-gate" className="space-y-4">
      <div>
        <h2 id="faq-gate" className="text-2xl font-semibold">Quick answers first</h2>
        <p className="text-sm text-muted">These are common questions under “{categoryLabel}”. They may already answer yours. <Link href="/faq" className="underline">See all FAQs</Link></p>
      </div>
      <FaqList faqs={faqs} />
      <div className="flex flex-wrap gap-3">
        <Button onClick={() => choose("resolved")} disabled={pending}>This answered my question</Button>
        <Button variant="outline" onClick={() => choose("escalated")} disabled={pending}>I still need a Guide</Button>
      </div>
    </section>
  );
}
