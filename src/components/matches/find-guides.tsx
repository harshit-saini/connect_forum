"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { RunView } from "@/server/matching/view";
import { ConnectButton } from "./connect-button";
import { MatchCardView } from "./match-card";

const STAGES = ["Starting your search", "Finding Guides who fit", "Ranking the best matches"];
const ACTIVE = new Set(["queued", "matching", "ranking"]);

export function FindGuides({ initial }: { initial: RunView | null }) {
  const [view, setView] = useState<RunView | null>(initial);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const started = useRef(0); // set when polling begins (not during render)

  const active = view ? ACTIVE.has(view.status) : false;
  const runId = view?.id;

  const load = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/matches/runs/${id}`, { cache: "no-store" });
      if (res.ok) setView((await res.json()) as RunView);
    } catch {
      /* transient network error: the next poll retries */
    }
  }, []);

  // Poll every 2.5s, backing off to 5s after the first 30 seconds.
  useEffect(() => {
    if (!active || !runId) return;
    started.current ||= Date.now();
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      await load(runId);
      if (cancelled) return;
      timer = setTimeout(tick, Date.now() - started.current > 30_000 ? 5000 : 2500);
    };
    timer = setTimeout(tick, 1500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [active, runId, load]);

  async function start() {
    setStarting(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/matches/start", { method: "POST" });
      const body = (await res.json()) as { runId?: string; cached?: boolean; message?: string; error?: string };
      if (!res.ok || !body.runId) {
        setError(body.error ?? "Something went wrong. Please try again.");
      } else {
        started.current = Date.now();
        if (body.cached && body.message) setNotice(body.message);
        await load(body.runId);
      }
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setStarting(false);
    }
  }

  const stage = view?.stage ?? 0;
  return (
    <section aria-labelledby="matches-heading" className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="matches-heading" className="text-2xl font-semibold">Your Guide matches</h2>
        <Button onClick={start} disabled={starting || active}>
          {active ? "Searching…" : view ? "Search again" : "Find guides"}
        </Button>
      </div>

      <div aria-live="polite" className="space-y-3">
        {error && <Alert tone="error">{error}</Alert>}
        {notice && <Alert>{notice}</Alert>}
        {view?.status === "failed" && <Alert tone="error">{view.error}</Alert>}
        {view?.status === "done" && view.degraded && (
          <Alert>These matches use our standard ranking. Explanations are general this time.</Alert>
        )}
      </div>

      {active && (
        <Card className="space-y-4" aria-busy="true">
          <div role="status">
            <p className="font-medium">{STAGES[Math.min(stage, STAGES.length - 1)]}…</p>
            <p className="text-sm text-muted">This usually takes under a minute. You can leave this page. We&apos;ll email you when your matches are ready.</p>
          </div>
          <div role="progressbar" aria-label="Search progress" aria-valuemin={0} aria-valuemax={STAGES.length} aria-valuenow={stage + 1} className="h-2 overflow-hidden rounded-full bg-border">
            <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${((stage + 1) / (STAGES.length + 1)) * 100}%` }} />
          </div>
          <ol className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {STAGES.map((s, i) => (
              <li key={s} className={i <= stage ? "font-medium" : "text-muted"}>{i < stage ? "✓ " : i === stage ? "● " : "○ "}{s}</li>
            ))}
          </ol>
        </Card>
      )}

      {view && view.matches.length > 0 && (
        <ol className="space-y-4">
          {view.matches.map((m) => (
            <li key={m.matchId}>
              <MatchCardView match={m} action={<ConnectButton matchId={m.matchId} alias={m.alias} onDone={() => void load(view!.id)} />} />
            </li>
          ))}
        </ol>
      )}

      {view?.status === "done" && view.matches.length === 0 && (
        <Card>
          <h3 className="font-semibold">No matching Guides yet</h3>
          <p className="mt-1 text-sm text-muted">No Guide currently fits your profile and preferences. New Guides join regularly, so try again later. Relaxing a preference (such as minimum experience) can also widen the pool.</p>
        </Card>
      )}

      {!view && (
        <Card>
          <h3 className="font-semibold">Ready when you are</h3>
          <p className="mt-1 text-sm text-muted">Press “Find guides” and we&apos;ll rank Guides who fit your goals, and explain why each one could help. Everyone stays anonymous until a Guide approves.</p>
        </Card>
      )}
    </section>
  );
}
