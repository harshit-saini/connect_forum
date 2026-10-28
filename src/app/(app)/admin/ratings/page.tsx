import { Pager } from "@/components/admin/pager";
import { listRatings } from "@/server/admin/service";

export const metadata = { title: "Admin · Ratings" };
export const dynamic = "force-dynamic";

export default async function AdminRatings({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const page = Math.max(1, Number((await searchParams).page) || 1);
  const { rows, total } = await listRatings(page);
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-semibold">Ratings and reviews</h1>
      <p className="text-sm text-muted">Visible to admins only. Guides see an average once they have 3 ratings; Seekers never see others&apos; reviews.</p>
      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.id} className="rounded-xl border border-border bg-card p-4 text-sm">
            <p><strong>{r.seekerEmail ?? "(deleted)"}</strong> rated <strong>{r.guideEmail ?? "(deleted)"}</strong> <span aria-label={`${r.score} out of 5`}>{"★".repeat(r.score)}{"☆".repeat(5 - r.score)}</span></p>
            {r.review && <p className="mt-1 whitespace-pre-line">{r.review}</p>}
            <p className="mt-1 text-xs text-muted">{r.createdAt.toISOString().slice(0, 10)}</p>
          </li>
        ))}
        {rows.length === 0 && <li className="text-sm text-muted">No ratings yet.</li>}
      </ul>
      <Pager basePath="/admin/ratings" page={page} total={total} />
    </div>
  );
}
