import type { Faq } from "@/config/faqs";

/** Native disclosure elements: keyboard accessible and no JavaScript needed. */
export function FaqList({ faqs }: { faqs: Faq[] }) {
  return (
    <div className="divide-y divide-border rounded-xl border border-border bg-card">
      {faqs.map((f) => (
        <details key={f.q} className="group p-4">
          <summary className="min-h-6 cursor-pointer font-medium">{f.q}</summary>
          <p className="mt-2 text-sm text-muted">{f.a}</p>
        </details>
      ))}
    </div>
  );
}
