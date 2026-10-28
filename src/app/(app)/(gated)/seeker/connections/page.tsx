import Link from "next/link";
import { Card } from "@/components/ui/card";
import { listSeekerConnections } from "@/server/connections/service";
import { requireCompletedProfile } from "@/server/viewer";

export const metadata = { title: "My connections" };

// Only connected Guides are listed. Rows from before direct connecting (pending/declined/expired) are not shown.
const SHOWN = new Set(["approved"]);

export default async function Connections() {
  const viewer = await requireCompletedProfile();
  const rows = (await listSeekerConnections(viewer.id)).filter((r) => SHOWN.has(r.status));
  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-3xl font-semibold">My connections</h1>
        <Link href="/seeker" className="text-sm underline">Back to matches</Link>
      </div>
      {rows.length === 0 ? (
        <Card>
          <h2 className="font-semibold">No connections yet</h2>
          <p className="mt-1 text-sm text-muted">When you press “I want to connect” on a match, we email you the Guide&apos;s details and it shows up here.</p>
        </Card>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id}>
              <Card className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">{r.name}</p>
                  <p className="text-sm text-muted">{r.createdAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}. Their details were emailed to you.</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="rounded-full border border-border px-3 py-1 text-xs font-medium">Connected</span>
                  <Link href={`/seeker/connections/${r.id}`} className="text-sm font-medium text-primary underline">Open</Link>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
