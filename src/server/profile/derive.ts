import "server-only";
import { normalizeCompany } from "@/lib/screening";
import type { GuideProfileData, Role, SeekerProfileData } from "@/schemas";

const dedupe = (a: string[]) => [...new Set(a.filter(Boolean))];

/** Columns derived from the answers so hard filters and scores can run in SQL. */
export function deriveCommon(data: SeekerProfileData | GuideProfileData) {
  const { basics, background } = data;
  return {
    country: basics.country,
    timezone: basics.timezone,
    languages: basics.languages,
    totalYears: background.totalYears,
    seniority: background.seniority,
    currentIndustry: background.industry,
    currentFunction: background.function,
    skills: dedupe(background.skills.map((s) => s.toLowerCase())),
    excludedCompanies: dedupe((background.excludedCompanies ?? []).map(normalizeCompany)),
  };
}

export function deriveSeeker(d: SeekerProfileData) {
  return {
    ...deriveCommon(d),
    availability: d.preferences.availability,
    mode: d.preferences.mode,
    careerStage: d.goals.careerStage,
    primaryGoal: d.goals.primaryGoal,
    targetIndustries: d.goals.targetIndustries,
    targetFunction: d.goals.targetFunction,
    helpNeeded: d.goals.helpNeeded,
    minGuideExperience: Number(d.preferences.minGuideExperience),
    mustShareLanguage: d.preferences.mustShareLanguage,
    engagementStyle: d.preferences.engagementStyle,
  };
}

export function deriveGuide(d: GuideProfileData) {
  return {
    ...deriveCommon(d),
    availability: d.availability.availability,
    mode: d.availability.mode,
    primaryFunctions: d.expertise.primaryFunctions,
    primaryIndustries: d.expertise.primaryIndustries,
    helpTypes: d.expertise.help.map((h) => h.type),
    stagesBestAt: d.expertise.stagesBestAt,
    transitions: d.expertise.transitions ?? [],
    hiringExperience: d.expertise.hiringExperience,
    wontHelpTypes: d.expertise.wontHelpWith?.types ?? [],
    maxNewSeekersPerMonth: d.availability.maxNewSeekersPerMonth,
    sessionLength: Number(d.availability.sessionLength),
    matchingPaused: d.availability.pauseMatching,
  };
}

/** Paths that never affect matching: changing only these leaves profile_version alone. */
const NON_MATCHING: Array<[string, string]> = [
  ["basics", "city"],
  ["basics", "consents"],
  ["basics", "consentedAt"],
  ["basics", "alias"],
  ["background", "linkedinUrl"],
  ["availability", "contactPreference"],
  ["availability", "bestTime"],
  ["availability", "acknowledgement"],
];

function stable(value: unknown): string {
  return JSON.stringify(value, (_k, v) =>
    v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v,
  );
}

/** Returns the answers with non-matching fields removed. */
export function matchingView(data: Record<string, unknown> | undefined): Record<string, unknown> {
  const copy = structuredClone(data ?? {}) as Record<string, Record<string, unknown>>;
  for (const [step, field] of NON_MATCHING) if (copy[step]) delete copy[step][field];
  return copy;
}

export function isMatchingChange(before: Record<string, unknown> | undefined, after: Record<string, unknown>): boolean {
  return stable(matchingView(before)) !== stable(matchingView(after));
}

export type { Role };
