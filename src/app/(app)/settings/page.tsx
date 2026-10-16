import { requireRole } from "@/server/viewer";

export const metadata = { title: "Settings" };

export default async function Settings() {
  const viewer = await requireRole();
  return (
    <div className="space-y-2">
      <h1 className="text-3xl font-semibold">Settings</h1>
      <p className="text-muted">Signed in as {viewer.email}. Data export and account deletion arrive in the final milestone.</p>
    </div>
  );
}
