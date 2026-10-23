import Link from "next/link";
import { Card } from "@/components/ui/card";
import { CATEGORIES } from "@/config/taxonomy";
import { faqStats, overview } from "@/server/admin/service";

export const metadata = { title: "Admin" };
export const dynamic = "force-dynamic";

export default async function AdminHome() {
  const [o, faq] = await Promise.all([overview(), faqStats()]);
  const stats: Array<[string, number, string]> = [
    ["Users", o.users, "/admin/users"],
    ["Seekers (profile complete)", o.seekers, "/admin/users"],
    ["Guides (profile complete)", o.guides, "/admin/users"],
    ["Open reports", o.openReports, "/admin/reports"],
    ["Suspended", o.suspended, "/admin/users?status=suspended"],
  ];
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">Admin</h1>
      <ul className="grid gap-4 sm:grid-cols-3">
        {stats.map(([label, n, href]) => (
          <li key={label}>
            <Link href={href}>
              <Card className="hover:bg-accent">
                <p className="text-sm text-muted">{label}</p>
                <p className="text-3xl font-semibold">{n}</p>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
      <Link href="/admin/invite" className="inline-block text-sm font-medium underline">Invite Guides by email</Link>

      <section aria-labelledby="faq-stats" className="space-y-3">
        <h2 id="faq-stats" className="text-xl font-semibold">FAQ self-service</h2>
        <p className="text-sm text-muted">Seekers who said the FAQs answered their question, versus those who still needed a Guide.</p>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-muted"><th className="py-1 font-medium">Category</th><th className="font-medium">Answered by FAQ</th><th className="font-medium">Went to a Guide</th></tr></thead>
          <tbody>
            {CATEGORIES.map((c) => (
              <tr key={c.value} className="border-t border-border"><td className="py-1.5">{c.label}</td><td>{faq.get(c.value)?.resolved ?? 0}</td><td>{faq.get(c.value)?.escalated ?? 0}</td></tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
