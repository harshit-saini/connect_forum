import { Card } from "@/components/ui/card";
import type { MatchCard as Match } from "@/server/matching/view";

function Chips({ items, label }: { items: string[]; label: string }) {
  if (!items.length) return null;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label={label}>
      {items.map((i) => (
        <li key={i} className="rounded-full bg-accent px-2.5 py-0.5 text-xs">{i}</li>
      ))}
    </ul>
  );
}

const CONNECTION_LABEL: Record<Match["connection"], string | null> = {
  none: null,
  pending: "Request sent",
  approved: "Approved",
  declined: "Declined",
  expired: "Request expired",
};

export function MatchCardView({ match, action }: { match: Match; action?: React.ReactNode }) {
  const { guide } = match;
  const status = CONNECTION_LABEL[match.connection];
  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">{match.alias}</h3>
          <p className="text-sm text-muted">{guide.title} · {guide.years} yrs · {guide.seniority}</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-semibold text-primary" aria-label={`Match score ${match.score} out of 100`}>{match.score}</p>
          <p className="text-xs text-muted">match</p>
        </div>
      </div>

      <p className="rounded-lg bg-accent p-3 text-sm"><span className="font-medium">Why this Guide: </span>{match.explanation}{!match.final && <span className="ml-1 text-muted">(refining…)</span>}</p>

      <Chips label="Can help with" items={guide.help.map((h) => `${h.type} · ${h.level}`)} />
      <Chips label="Focus" items={[...guide.functions, ...guide.industries]} />
      {guide.transitions.length > 0 && <Chips label="Transitions made" items={guide.transitions} />}

      <details className="text-sm">
        <summary className="cursor-pointer font-medium text-primary">About this Guide</summary>
        <p className="mt-2 whitespace-pre-line">{guide.summary}</p>
        <p className="mt-2 text-muted">Hiring experience: {guide.hiring}</p>
      </details>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {match.rating ? `★ ${match.rating.average.toFixed(1)} (${match.rating.count} ratings)` : "New Guide"}
        </p>
        {status && <span className="rounded-full border border-border px-3 py-1 text-xs font-medium">{status}</span>}
        {!status && action}
      </div>
    </Card>
  );
}
