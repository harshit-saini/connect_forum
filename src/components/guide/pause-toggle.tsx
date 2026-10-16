"use client";
import { useOptimistic, useState, useTransition } from "react";
import { setMatchingPausedAction } from "@/server/actions/guide";

export function PauseToggle({ paused }: { paused: boolean }) {
  const [pending, start] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(paused);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <label className="flex min-h-11 cursor-pointer items-center justify-between gap-4">
        <span>
          <span className="block font-medium">{optimistic ? "Matching is paused" : "Matching is active"}</span>
          <span className="block text-sm text-muted">{optimistic ? "No new Seekers will be matched with you." : "New Seekers can be matched with you."}</span>
        </span>
        <input
          type="checkbox" role="switch" aria-label="Pause matching" checked={optimistic} disabled={pending}
          className="size-6 accent-[var(--primary)]"
          onChange={(e) => {
            const next = e.target.checked;
            setError(null);
            start(async () => {
              setOptimistic(next);
              const res = await setMatchingPausedAction(next);
              if (!res.ok) setError(res.error ?? "Could not update.");
            });
          }}
        />
      </label>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  );
}
