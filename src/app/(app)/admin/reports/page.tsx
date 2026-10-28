import { Pager } from "@/components/admin/pager";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { REPORT_REASONS } from "@/config/safety";
import { listReports } from "@/server/admin/service";
import { reviewReportAction, suspendUserAction } from "@/server/actions/admin";

export const metadata = { title: "Admin · Reports" };
export const dynamic = "force-dynamic";

export default async function AdminReports({ searchParams }: { searchParams: Promise<{ all?: string; page?: string }> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const { rows, total } = await listReports(sp.all ? "all" : "open", page);
  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-3xl font-semibold">Reports</h1>
        <a href={sp.all ? "/admin/reports" : "/admin/reports?all=1"} className="text-sm underline">{sp.all ? "Show open only" : "Show all"}</a>
      </div>
      {rows.length === 0 && <Card><p className="text-sm text-muted">No {sp.all ? "" : "open "}reports.</p></Card>}
      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.id}>
            <Card className="space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p><strong>{r.reporterEmail ?? "(deleted)"}</strong> reported <strong>{r.reportedEmail ?? "(deleted)"}</strong></p>
                <span className="rounded-full border border-border px-2 py-0.5 text-xs">{r.status}</span>
              </div>
              <p className="text-sm">{REPORT_REASONS.find((x) => x.value === r.reason)?.label ?? r.reason}{r.details ? `: ${r.details}` : ""}</p>
              <p className="text-xs text-muted">{r.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC</p>
              {r.status === "open" && (
                <div className="flex flex-wrap gap-2">
                  <form action={reviewReportAction}><input type="hidden" name="reportId" value={r.id} /><input type="hidden" name="outcome" value="reviewed" /><Button type="submit" variant="outline" className="min-h-9">Mark reviewed</Button></form>
                  <form action={reviewReportAction}><input type="hidden" name="reportId" value={r.id} /><input type="hidden" name="outcome" value="dismissed" /><Button type="submit" variant="ghost" className="min-h-9">Dismiss</Button></form>
                  {!r.reportedSuspended && (
                    <form action={suspendUserAction}><input type="hidden" name="userId" value={r.reportedId} /><input type="hidden" name="reason" value="Suspended after a report" /><Button type="submit" variant="danger" className="min-h-9">Suspend {r.reportedEmail ?? "user"}</Button></form>
                  )}
                </div>
              )}
            </Card>
          </li>
        ))}
      </ul>
      <Pager basePath="/admin/reports" params={{ all: sp.all }} page={page} total={total} />
    </div>
  );
}
