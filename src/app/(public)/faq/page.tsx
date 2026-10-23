import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { FaqList } from "@/components/faq/faq-list";
import { CATEGORIES } from "@/config/taxonomy";
import { FAQS } from "@/config/faqs";

export const metadata = { title: "FAQs" };

export default function FaqPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-8 pt-8">
      <div>
        <h1 className="text-3xl font-semibold">Frequently asked questions</h1>
        <p className="mt-1 text-muted">Many questions are answered here. If yours isn&apos;t, a Guide can help.</p>
      </div>
      {CATEGORIES.map((c) => (
        <section key={c.value} aria-labelledby={`faq-${c.value}`} className="space-y-3">
          <h2 id={`faq-${c.value}`} className="text-xl font-semibold">{c.label}</h2>
          <FaqList faqs={FAQS[c.value]} />
        </section>
      ))}
      <Link href="/join/seeker" className={buttonVariants()}>Still need a Guide? Ask a question</Link>
    </div>
  );
}
