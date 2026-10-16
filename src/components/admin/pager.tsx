import Link from "next/link";
import { PAGE_SIZE } from "@/server/admin/service";

export function Pager({ basePath, params, page, total }: { basePath: string; params?: Record<string, string | undefined>; page: number; total: number }) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (p: number) => {
    const q = new URLSearchParams(Object.entries({ ...params, page: String(p) }).filter(([, v]) => v) as [string, string][]);
    return `${basePath}?${q}`;
  };
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between text-sm">
      <span className="text-muted">{total} total · page {page} of {pages}</span>
      <span className="flex gap-4">
        {page > 1 && <Link href={href(page - 1)} className="underline">Previous</Link>}
        {page < pages && <Link href={href(page + 1)} className="underline">Next</Link>}
      </span>
    </nav>
  );
}
