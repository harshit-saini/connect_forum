"use client";
import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deleteAccountAction, type DeleteState } from "@/server/actions/account";

export function DeleteAccount() {
  const [state, action, pending] = useActionState<DeleteState, FormData>(deleteAccountAction, {});
  const [text, setText] = useState("");
  return (
    <form action={action} className="space-y-3">
      <p className="text-sm text-muted">This permanently deletes your profile, connections, matches, ratings and (for Guides) your encrypted phone number. It can&apos;t be undone.</p>
      <label htmlFor="confirm" className="block text-sm font-medium">Type <strong>DELETE</strong> to confirm</label>
      <Input id="confirm" name="confirm" autoComplete="off" value={text} onChange={(e) => setText(e.target.value)} />
      {state.error && <Alert tone="error">{state.error}</Alert>}
      <Button type="submit" variant="danger" disabled={pending || text.trim() !== "DELETE"}>{pending ? "Deleting…" : "Delete my account"}</Button>
    </form>
  );
}
