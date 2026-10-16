export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="space-y-4" aria-busy="true">
      <span className="sr-only">Loading…</span>
      <div className="h-8 w-56 animate-pulse rounded-lg bg-border" />
      <div className="h-32 animate-pulse rounded-2xl bg-border/70" />
      <div className="h-32 animate-pulse rounded-2xl bg-border/70" />
    </div>
  );
}
