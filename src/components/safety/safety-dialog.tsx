"use client";
import { useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { REPORT_REASONS } from "@/config/safety";

export type SafetyInput = { action: "report" | "block"; reason?: string; details?: string };

/**
 * Report or block, in one dialog. `onSubmit` returns an error message, or null on success.
 * Blocking is immediate and removes the pair from matching; reporting also alerts the admins.
 */
export function SafetyDialog({ who, onSubmit, onDone }: { who: string; onSubmit: (input: SafetyInput) => Promise<string | null>; onDone?: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [action, setAction] = useState<"report" | "block">("report");
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<"report" | "block" | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    const err = await onSubmit({ action, reason: action === "report" ? reason : undefined, details: action === "report" ? details : undefined });
    setBusy(false);
    if (err) return setError(err);
    setDone(action);
    onDone?.();
  }

  return (
    <>
      <button type="button" className="text-sm text-muted underline underline-offset-4 hover:text-foreground" onClick={() => { setDone(null); setError(null); ref.current?.showModal(); }}>
        Report or block
      </button>
      <dialog ref={ref} aria-label={`Report or block ${who}`} className="m-auto w-[min(92vw,28rem)] rounded-2xl border border-border bg-card p-6 text-foreground backdrop:bg-black/50">
        {done ? (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">{done === "block" ? "Blocked" : "Thanks for letting us know"}</h2>
            <p className="text-sm text-muted">{done === "block" ? `${who} won't be matched with you again.` : "Our team will review your report. You won't be matched with this person again."}</p>
            <div className="flex justify-end"><Button onClick={() => ref.current?.close()}>Close</Button></div>
          </div>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="space-y-4">
            <h2 className="text-xl font-semibold">Report or block {who}</h2>
            <fieldset className="space-y-2">
              <legend className="sr-only">What would you like to do?</legend>
              {(["report", "block"] as const).map((a) => (
                <label key={a} className="flex min-h-11 cursor-pointer items-start gap-2.5 rounded-lg border border-border p-3 text-sm">
                  <input type="radio" name="action" value={a} checked={action === a} onChange={() => setAction(a)} className="mt-0.5 size-4 accent-[var(--primary)]" />
                  <span>
                    <span className="font-medium">{a === "report" ? "Report" : "Block"}</span>
                    <span className="block text-muted">{a === "report" ? "Tell our team about a problem. You won't be matched again." : "Stop all contact and matching right away. Nothing is sent to them."}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            {action === "report" && (
              <>
                <div>
                  <label htmlFor="report-reason" className="mb-1.5 block text-sm font-medium">Reason</label>
                  <select id="report-reason" required value={reason} onChange={(e) => setReason(e.target.value)} className="min-h-11 w-full rounded-lg border border-border bg-background px-3 text-base">
                    <option value="">Select…</option>
                    {REPORT_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="report-details" className="mb-1.5 flex justify-between text-sm font-medium"><span>Details <span className="font-normal text-muted">(optional)</span></span><span className="text-xs font-normal text-muted">{details.length}/500</span></label>
                  <textarea id="report-details" rows={3} maxLength={500} value={details} onChange={(e) => setDetails(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-base" />
                </div>
              </>
            )}
            {error && <Alert tone="error">{error}</Alert>}
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => ref.current?.close()}>Cancel</Button>
              <Button type="submit" variant={action === "block" ? "danger" : "primary"} disabled={busy || (action === "report" && !reason)}>{busy ? "Sending…" : action === "block" ? "Block" : "Send report"}</Button>
            </div>
          </form>
        )}
      </dialog>
    </>
  );
}
