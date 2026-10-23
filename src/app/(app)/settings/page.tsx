import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requireViewer } from "@/server/viewer";
import { DeleteAccount } from "./delete-account";

export const metadata = { title: "Settings" };

export default async function Settings() {
  const viewer = await requireViewer();
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-3xl font-semibold">Settings</h1>
      <Card className="space-y-1 text-sm">
        <h2 className="font-semibold">Account</h2>
        <p>Signed in as <strong>{viewer.email}</strong>{viewer.role && <> · <span className="capitalize">{viewer.role}</span></>}</p>
      </Card>
      <Card className="space-y-3">
        <h2 className="font-semibold">Export your data</h2>
        <p className="text-sm text-muted">Download a copy of what we hold about you as a JSON file. Phone numbers are never included.</p>
        <form method="post" action="/api/account/export"><Button type="submit" variant="outline">Download my data</Button></form>
      </Card>
      <Card className="space-y-3 border-danger/40">
        <h2 className="font-semibold text-danger">Delete your account</h2>
        <DeleteAccount />
      </Card>
    </div>
  );
}
