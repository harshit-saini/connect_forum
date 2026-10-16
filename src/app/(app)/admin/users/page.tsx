import { Pager } from "@/components/admin/pager";
import { Button } from "@/components/ui/button";
import { listUsers } from "@/server/admin/service";
import { suspendUserAction, unsuspendUserAction } from "@/server/actions/admin";

export const metadata = { title: "Admin · Users" };
export const dynamic = "force-dynamic";

export default async function AdminUsers({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; page?: string }> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const { rows, total } = await listUsers({ q: sp.q?.trim() || undefined, status: sp.status === "suspended" ? "suspended" : "all", page });
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-semibold">Users</h1>
      <form className="flex flex-wrap gap-2" role="search">
        <input name="q" defaultValue={sp.q} placeholder="Search email or alias" aria-label="Search users" className="min-h-11 flex-1 rounded-lg border border-border bg-card px-3" />
        <select name="status" defaultValue={sp.status ?? "all"} aria-label="Status" className="min-h-11 rounded-lg border border-border bg-card px-3">
          <option value="all">All</option>
          <option value="suspended">Suspended</option>
        </select>
        <Button type="submit">Search</Button>
      </form>
      <div className="overflow-x-auto rounded-xl border border-border" role="region" aria-label="Users table" tabIndex={0}>
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="bg-accent text-xs uppercase tracking-wide text-muted">
            <tr><th className="p-3">Alias</th><th className="p-3">Email</th><th className="p-3">Role</th><th className="p-3">Profile</th><th className="p-3">Status</th><th className="p-3"><span className="sr-only">Actions</span></th></tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id} className="border-t border-border">
                <td className="p-3 font-medium">{u.alias ?? "—"}</td>
                <td className="p-3">{u.email}</td>
                <td className="p-3 capitalize">{u.role ?? "—"}</td>
                <td className="p-3">{u.profileCompleted ? "Complete" : "Incomplete"}</td>
                <td className="p-3">{u.suspendedAt ? <span className="rounded-full bg-danger-bg px-2 py-0.5 text-xs text-danger">Suspended</span> : "Active"}</td>
                <td className="p-3">
                  {u.suspendedAt ? (
                    <form action={unsuspendUserAction}><input type="hidden" name="userId" value={u.id} /><Button type="submit" variant="outline" className="min-h-9">Unsuspend</Button></form>
                  ) : (
                    <form action={suspendUserAction} className="flex gap-2">
                      <input type="hidden" name="userId" value={u.id} />
                      <input name="reason" maxLength={200} placeholder="Reason" aria-label={`Reason for suspending ${u.alias ?? u.email}`} className="min-h-9 w-32 rounded-lg border border-border bg-card px-2" />
                      <Button type="submit" variant="danger" className="min-h-9">Suspend</Button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted">No users found.</td></tr>}
          </tbody>
        </table>
      </div>
      <Pager basePath="/admin/users" params={{ q: sp.q, status: sp.status }} page={page} total={total} />
    </div>
  );
}
