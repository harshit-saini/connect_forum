"use client";
import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { decideAction, type ReviewActionState } from "@/server/actions/review";

export function ReviewForm({ token, csrf }: { token: string; csrf: string }) {
  const [state, action, pending] = useActionState<ReviewActionState, FormData>(decideAction, {});

  if (state.done) {
    return (
      <Alert>
        {state.done === "approved"
          ? "Thank you. The Seeker has been notified and can now see how to reach you."
          : "Thank you. The Seeker has been told, kindly, that you can't take this request."}
      </Alert>
    );
  }
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="csrf" value={csrf} />
      {state.error && <Alert tone="error">{state.error}</Alert>}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" name="decision" value="approve" disabled={pending}>Approve and share my number</Button>
        <Button type="submit" name="decision" value="decline" variant="outline" disabled={pending}>Decline</Button>
      </div>
      <p className="text-sm text-muted">Approving shows your phone number to this Seeker only. You can decline without giving a reason.</p>
    </form>
  );
}
