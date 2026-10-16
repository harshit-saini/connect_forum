import { Pager } from "@/components/admin/pager";
import { Button } from "@/components/ui/button";
import { listAudit } from "@/server/admin/service";

export const metadata = { title: "Admin · Audit log" };
export const dynamic = "force-dynamic";

export default async function AdminAudit({ searchParams }: { searchParams: Promise<{ action?: string; page?: string }> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const { rows, total, actions } = await listAudit({ action: sp.action || undefined, page });
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-semibold">Audit log</h1>
      <form className="flex gap-2" role="search">
        <select name="action" defaultValue={sp.action ?? ""} aria-label="Filter by action" className="min-h-11 rounded-lg border border-border bg-card px-3">
          <option value="">All actions</option>
          {actions.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <Button type="submit">Filter</Button>
      </form>
      <div className="overflow-x-auto rounded-xl border border-border" role="region" aria-label="Audit log table" tabIndex={0}>
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="bg-accent text-xs uppercase tracking-wide text-muted"><tr><th className="p-3">When (UTC)</th><th className="p-3">Action</th><th className="p-3">By</th><th className="p-3">About</th><th className="p-3">Details</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border align-top">
                <td className="whitespace-nowrap p-3">{r.at.toISOString().slice(0, 19).replace("T", " ")}</td>
                <td className="p-3 font-medium">{r.action}</td>
                <td className="p-3">{r.actorAlias ?? "—"}</td>
                <td className="p-3">{r.targetAlias ?? "—"}</td>
                <td className="p-3 text-xs text-muted">{Object.keys(r.metadata).length ? JSON.stringify(r.metadata) : ""}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted">Nothing logged yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <Pager basePath="/admin/audit" params={{ action: sp.action }} page={page} total={total} />
    </div>
  );
}
