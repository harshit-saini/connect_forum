import Link from "next/link";
import { Card } from "@/components/ui/card";
import { listSeekerConnections } from "@/server/connections/service";
import { requireCompletedProfile } from "@/server/viewer";

export const metadata = { title: "My requests" };

const STATUS: Record<string, { label: string; hint: string }> = {
  pending: { label: "Waiting for reply", hint: "Guides have 7 days to respond." },
  approved: { label: "Approved", hint: "You can now see how to reach this Guide." },
  declined: { label: "Declined", hint: "This Guide can't take your request. Try another match." },
  expired: { label: "Expired", hint: "No reply within 7 days. Try another match." },
  cancelled: { label: "Cancelled", hint: "" },
};

export default async function Connections() {
  const viewer = await requireCompletedProfile();
  const rows = await listSeekerConnections(viewer.id);
  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-3xl font-semibold">My requests</h1>
        <Link href="/seeker" className="text-sm underline">Back to matches</Link>
      </div>
      {rows.length === 0 ? (
        <Card>
          <h2 className="font-semibold">No requests yet</h2>
          <p className="mt-1 text-sm text-muted">When you press “I want to connect” on a match, it shows up here.</p>
        </Card>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => {
            const s = STATUS[r.status] ?? { label: r.status, hint: "" };
            return (
              <li key={r.id}>
                <Card className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">{r.name}</p>
                    <p className="text-sm text-muted">Sent {r.createdAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}. {s.hint}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="rounded-full border border-border px-3 py-1 text-xs font-medium">{s.label}</span>
                    {r.status === "approved" && <Link href={`/seeker/connections/${r.id}`} className="text-sm font-medium text-primary underline">Open</Link>}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
