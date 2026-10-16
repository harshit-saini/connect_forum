import Link from "next/link";
import { Card } from "@/components/ui/card";
import {
  CAREER_STAGES, EMPLOYMENT_STATUS, ENGAGEMENT_STYLES, FUNCTIONS, HELP_LEVELS, HELP_TYPES, INDUSTRIES, MODES, PRIMARY_GOALS, SENIORITY, labelOf,
} from "@/config/taxonomy";
import { COUNTRIES } from "@/lib/countries";
import { STEP_ORDER, STEP_TITLES, type GuideProfileData, type Role, type SeekerProfileData, type StepKey } from "@/schemas";

type Data = Partial<SeekerProfileData> & Partial<GuideProfileData> & Record<string, unknown>;

function Item({ label, value }: { label: string; value?: React.ReactNode }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div className="grid gap-0.5 sm:grid-cols-[12rem_1fr]">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="text-sm">{value}</dd>
    </div>
  );
}

const join = (list: string[] | undefined, map: (v: string) => string) => (list?.length ? list.map(map).join(", ") : undefined);

function lines(role: Role, data: Data, step: StepKey, phone: { has: boolean; last4: string | null }) {
  const b = data.basics;
  const bg = data.background;
  const g = data.goals;
  const p = data.preferences;
  const e = data.expertise;
  const a = data.availability as GuideProfileData["availability"] | undefined;
  switch (step) {
    case "basics":
      return b && (
        <>
          <Item label="Alias" value={b.alias} />
          <Item label="Country" value={COUNTRIES.find((c) => c.code === b.country)?.name} />
          <Item label="City (private)" value={b.city} />
          <Item label="Timezone" value={b.timezone} />
          <Item label="Languages" value={join(b.languages, (l) => l.charAt(0).toUpperCase() + l.slice(1))} />
        </>
      );
    case "background":
      return bg && (
        <>
          <Item label="Status" value={labelOf(EMPLOYMENT_STATUS, bg.status)} />
          <Item label="Job title" value={bg.jobTitle} />
          <Item label="Industry · function" value={`${labelOf(INDUSTRIES, bg.industry)} · ${labelOf(FUNCTIONS, bg.function)}`} />
          <Item label="Experience" value={`${bg.totalYears} years (${labelOf(SENIORITY, bg.seniority)})`} />
          <Item label="Skills" value={bg.skills.join(", ")} />
          <Item label="Past roles" value={bg.timeline?.length ? bg.timeline.map((t) => `${t.title} (${t.startYear}–${t.endYear ?? "now"})`).join("; ") : undefined} />
          <Item label="Excluded companies (private)" value={bg.excludedCompanies?.join(", ")} />
        </>
      );
    case "goals":
      return g && (
        <>
          <Item label="Career stage" value={labelOf(CAREER_STAGES, g.careerStage)} />
          <Item label="Primary goal" value={labelOf(PRIMARY_GOALS, g.primaryGoal)} />
          <Item label="Target roles" value={g.targetRoles.join(", ")} />
          <Item label="Help needed (ranked)" value={g.helpNeeded.map((h, i) => `${i + 1}. ${labelOf(HELP_TYPES, h)}`).join("  ")} />
          <Item label="Biggest challenge" value={g.challenge} />
        </>
      );
    case "preferences":
      return p && (
        <>
          <Item label="Engagement" value={labelOf(ENGAGEMENT_STYLES, p.engagementStyle)} />
          <Item label="Mode" value={labelOf(MODES, p.mode)} />
          <Item label="Availability" value={`${p.availability.length} weekly slots`} />
          <Item label="Must share a language" value={p.mustShareLanguage ? "Yes" : "No"} />
        </>
      );
    case "expertise":
      return e && (
        <>
          <Item label="Functions" value={join(e.primaryFunctions, (f) => labelOf(FUNCTIONS, f))} />
          <Item label="Industries" value={join(e.primaryIndustries, (i) => labelOf(INDUSTRIES, i))} />
          <Item label="Can help with" value={e.help.map((h, i) => `${i + 1}. ${labelOf(HELP_TYPES, h.type)} (${labelOf(HELP_LEVELS, h.level).toLowerCase()})`).join("  ")} />
          <Item label="Summary" value={e.experienceSummary} />
        </>
      );
    case "availability":
      return a && (
        <>
          <Item label="New Seekers per month" value={a.maxNewSeekersPerMonth} />
          <Item label="Availability" value={`${a.availability.length} weekly slots`} />
          <Item label="Session length" value={`${a.sessionLength} min`} />
          <Item label="Phone number" value={phone.has ? `Saved securely (ends ${phone.last4})` : "Not set"} />
          <Item label="Matching" value={a.pauseMatching ? "Paused" : "Active"} />
        </>
      );
    default:
      return role && null;
  }
}

/** Read-only summary of every step with Edit links. */
export function ProfileSummary({ role, data, phone, editHref }: { role: Role; data: Data; phone: { has: boolean; last4: string | null }; editHref: (step: StepKey) => string }) {
  return (
    <div className="space-y-4">
      {STEP_ORDER[role].filter((s) => s !== "review").map((step) => (
        <Card key={step} className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">{STEP_TITLES[step]}</h3>
            <Link href={editHref(step)} className="text-sm font-medium text-primary underline-offset-4 hover:underline">Edit</Link>
          </div>
          <dl className="space-y-2">{lines(role, data, step, phone)}</dl>
        </Card>
      ))}
    </div>
  );
}
