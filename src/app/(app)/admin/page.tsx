import Link from "next/link";
import { Card } from "@/components/ui/card";
import { overview } from "@/server/admin/service";

export const metadata = { title: "Admin" };
export const dynamic = "force-dynamic";

export default async function AdminHome() {
  const o = await overview();
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
    </div>
  );
}
