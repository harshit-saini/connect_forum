import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { chooseRole } from "@/server/actions/role";
import { dashboardPath, requireViewer } from "@/server/viewer";

export const metadata = { title: "Choose your role" };

const roles = [
  { value: "seeker", title: "I need career guidance", body: "Get matched with experienced Guides who can help with your goals." },
  { value: "guide", title: "I want to guide others", body: "Share your experience with people early in their journey, on your terms." },
] as const;

export default async function ChooseRole() {
  const viewer = await requireViewer();
  if (viewer.role) redirect(dashboardPath(viewer.role));
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">How would you like to use Connect?</h1>
        <p className="mt-1 text-muted">This choice is permanent for now. You can ask support to change it.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {roles.map((r) => (
          <Card key={r.value}>
            <form action={chooseRole} className="flex h-full flex-col gap-3">
              <input type="hidden" name="role" value={r.value} />
              <h2 className="text-lg font-semibold">{r.title}</h2>
              <p className="flex-1 text-sm text-muted">{r.body}</p>
              <Button type="submit">Continue as {r.value === "seeker" ? "Seeker" : "Guide"}</Button>
            </form>
          </Card>
        ))}
      </div>
    </div>
  );
}
