import { Card } from "@/components/ui/card";
import {
  CAREER_STAGES, FUNCTIONS, HELP_LEVELS, HELP_TYPES, HIRING_EXPERIENCE, INDUSTRIES, PRIMARY_GOALS, SENIORITY, TRANSITIONS, labelOf,
} from "@/config/taxonomy";
import type { GuideProfileData, SeekerProfileData } from "@/schemas";

function Chips({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((i) => <li key={i} className="rounded-full bg-accent px-2.5 py-0.5 text-xs">{i}</li>)}
    </ul>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );
}

/** The public view of a profile: what the other side sees. Alias and public fields only. */
export function AnonymousCard({ role, data }: { role: "seeker" | "guide"; data: Partial<SeekerProfileData> | Partial<GuideProfileData> }) {
  const alias = data.basics?.alias ?? "Your alias";
  const bg = data.background;
  if (role === "seeker") {
    const g = (data as Partial<SeekerProfileData>).goals;
    return (
      <Card className="space-y-3">
        <div>
          <p className="text-lg font-semibold">{alias}</p>
          {bg && <p className="text-sm text-muted">{bg.jobTitle} · {bg.totalYears} yrs · {labelOf(SENIORITY, bg.seniority)}</p>}
        </div>
        {g && (
          <dl className="space-y-3">
            <Row label="Career stage">{labelOf(CAREER_STAGES, g.careerStage)}</Row>
            <Row label="Goal">{labelOf(PRIMARY_GOALS, g.primaryGoal)}</Row>
            <Row label="Target">{g.targetRoles?.join(", ")} · {g.targetIndustries?.map((i) => labelOf(INDUSTRIES, i)).join(", ")}</Row>
            <Row label="Help needed"><Chips items={(g.helpNeeded ?? []).slice(0, 3).map((h) => labelOf(HELP_TYPES, h))} /></Row>
            <Row label="Biggest challenge"><span className="line-clamp-4">{g.challenge}</span></Row>
          </dl>
        )}
      </Card>
    );
  }
  const e = (data as Partial<GuideProfileData>).expertise;
  return (
    <Card className="space-y-3">
      <div>
        <p className="text-lg font-semibold">{alias}</p>
        {bg && <p className="text-sm text-muted">{bg.jobTitle} · {bg.totalYears} yrs · {labelOf(SENIORITY, bg.seniority)}</p>}
      </div>
      {e && (
        <dl className="space-y-3">
          <Row label="Focus">{e.primaryFunctions?.map((f) => labelOf(FUNCTIONS, f)).join(", ")} · {e.primaryIndustries?.map((i) => labelOf(INDUSTRIES, i)).join(", ")}</Row>
          <Row label="Can help with"><Chips items={(e.help ?? []).slice(0, 4).map((h) => `${labelOf(HELP_TYPES, h.type)} (${labelOf(HELP_LEVELS, h.level).toLowerCase()})`)} /></Row>
          <Row label="Best with"><Chips items={(e.stagesBestAt ?? []).map((s) => labelOf(CAREER_STAGES, s))} /></Row>
          {!!e.transitions?.length && <Row label="Transitions made"><Chips items={e.transitions.map((t) => labelOf(TRANSITIONS, t))} /></Row>}
          <Row label="Hiring experience">{labelOf(HIRING_EXPERIENCE, e.hiringExperience)}</Row>
          <Row label="About"><span className="line-clamp-4">{e.experienceSummary}</span></Row>
        </dl>
      )}
    </Card>
  );
}
