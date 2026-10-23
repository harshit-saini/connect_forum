"use client";
import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { inviteGuidesAction } from "@/server/actions/admin";
import type { InviteResult } from "@/server/admin/service";

export function InviteForm() {
  const [result, action, pending] = useActionState<InviteResult | null, FormData>(inviteGuidesAction, null);
  return (
    <form action={action} className="space-y-4">
      <div>
        <Label htmlFor="emails">Email addresses</Label>
        <textarea id="emails" name="emails" rows={6} required placeholder="one@example.com, two@example.com" className="w-full rounded-lg border border-border bg-card p-3 text-base" />
        <p className="mt-1 text-xs text-muted">Separate with commas, spaces or new lines. Up to 25 at a time.</p>
      </div>
      <div aria-live="polite">
        {result && !result.ok && <Alert tone="error">{result.message}</Alert>}
        {result?.ok && (
          <Alert>
            Sent {result.sent} invitation{result.sent === 1 ? "" : "s"}.
            {result.failed > 0 && ` ${result.failed} could not be sent.`}
            {result.invalid.length > 0 && ` Skipped invalid: ${result.invalid.join(", ")}.`}
          </Alert>
        )}
      </div>
      <Button type="submit" disabled={pending}>{pending ? "Sending…" : "Send invitations"}</Button>
    </form>
  );
}
