"use client";
import { useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type Revealed = { phone: string };

/** Fetches the number on demand. It lives only in component state: it is never persisted or cached. */
export function RevealNumber({ connectionId }: { connectionId: string }) {
  const [data, setData] = useState<Revealed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Hide again after a few minutes so the number does not sit on an unattended screen.
  useEffect(() => {
    if (!data) return;
    hideTimer.current = setTimeout(() => setData(null), 5 * 60_000);
    return () => clearTimeout(hideTimer.current);
  }, [data]);

  async function show() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/connections/${connectionId}/reveal`, { method: "POST", cache: "no-store" });
      const body = await res.json();
      if (!res.ok) return setError(body.error ?? "Something went wrong. Please try again.");
      setData(body as Revealed);
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return (
      <Card className="space-y-3">
        <h2 className="text-xl font-semibold">Contact this Guide</h2>
        <p className="text-sm text-muted">This Guide approved your request. Their number is shown only to you, and contact happens outside Connect.</p>
        {error && <Alert tone="error">{error}</Alert>}
        <Button onClick={show} disabled={busy}>{busy ? "Loading…" : "Show number"}</Button>
      </Card>
    );
  }
  return (
    <Card className="space-y-3">
      <h2 className="text-xl font-semibold">Contact this Guide</h2>
      <p className="text-3xl font-semibold tracking-wide" data-testid="revealed-number">{data.phone}</p>
      <div className="flex flex-wrap gap-3">
        <a href={`tel:${data.phone}`} className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">Call</a>
        <Button variant="outline" onClick={async () => { await navigator.clipboard?.writeText(data.phone).catch(() => undefined); setCopied(true); }}>{copied ? "Copied" : "Copy"}</Button>
        <Button variant="ghost" onClick={() => { setData(null); setCopied(false); }}>Hide</Button>
      </div>
      <p className="text-xs text-muted">Please be respectful of their time. This number is for you only. Don&apos;t share it.</p>
    </Card>
  );
}
