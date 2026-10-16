"use client";
import { useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { screenText } from "@/lib/screening";

const MAX = 300;

/** "I want to connect": an optional short note, screened for contact details, then a request. */
export function ConnectButton({ matchId, alias, onDone }: { matchId: string; alias: string; onDone: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const hint = screenText(note).errors[0];

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/connections", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ matchId, note: note.trim() || undefined }) });
      const body = (await res.json()) as { error?: string; code?: string };
      if (res.status === 404 || body.code === "not_found") {
        // The list was refreshed under the user (preliminary matches became final): reload it.
        dialog.current?.close();
        onDone();
        return;
      }
      if (!res.ok) return setError(body.error ?? "Something went wrong. Please try again.");
      dialog.current?.close();
      setNote("");
      onDone();
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button type="button" onClick={() => dialog.current?.showModal()}>I want to connect</Button>
      <dialog ref={dialog} aria-labelledby={`connect-${matchId}`} className="m-auto w-[min(92vw,28rem)] rounded-2xl border border-border bg-card p-6 text-foreground backdrop:bg-black/50">
        <h2 id={`connect-${matchId}`} className="text-xl font-semibold">Connect with {alias}</h2>
        <p className="mt-1 text-sm text-muted">They&apos;ll see your alias and career details, never your contact information. If they approve, you&apos;ll see their number here.</p>
        <label htmlFor={`note-${matchId}`} className="mt-4 flex justify-between text-sm font-medium">
          <span>Add a short note <span className="font-normal text-muted">(optional)</span></span>
          <span className="text-xs font-normal text-muted">{note.length}/{MAX}</span>
        </label>
        <textarea id={`note-${matchId}`} rows={4} maxLength={MAX} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. I'd love your view on moving from engineering to product." aria-invalid={Boolean(hint)} className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-base aria-[invalid=true]:border-danger" />
        {hint && <p role="alert" className="mt-1 text-sm text-danger">{hint}</p>}
        {error && <Alert tone="error" className="mt-3">{error}</Alert>}
        <div className="mt-5 flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => dialog.current?.close()}>Cancel</Button>
          <Button type="button" disabled={busy || Boolean(hint)} onClick={send}>{busy ? "Sending…" : "Send request"}</Button>
        </div>
      </dialog>
    </>
  );
}
