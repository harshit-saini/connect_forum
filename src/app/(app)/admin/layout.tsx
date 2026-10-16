import Link from "next/link";
import { requireAdmin } from "@/server/viewer";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div className="space-y-6">
      <nav aria-label="Admin" className="flex flex-wrap gap-4 border-b border-border pb-3 text-sm font-medium">
        <Link href="/admin" className="hover:underline">Overview</Link>
        <Link href="/admin/users" className="hover:underline">Users</Link>
        <Link href="/admin/reports" className="hover:underline">Reports</Link>
        <Link href="/admin/ratings" className="hover:underline">Ratings</Link>
        <Link href="/admin/audit" className="hover:underline">Audit log</Link>
      </nav>
      {children}
    </div>
  );
}
