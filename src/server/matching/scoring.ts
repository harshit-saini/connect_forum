import { MATCHING, type HelpLevel } from "@/config/matching";
import { SENIORITY } from "@/config/taxonomy";

/** The fields of a Seeker the scorer needs (plain data, so it is testable without a database). */
export type SeekerFacts = {
  careerStage: string;
  primaryGoal: string;
  helpNeeded: string[]; // ordered, rank = position
  targetFunction: string;
  targetIndustries: string[];
  seniority: string;
  similarTransition: boolean;
  engagementStyle: string;
  mode: string;
  availability: string[];
  timezone: string;
  preferredFunctions: string[];
  preferredIndustries: string[];
};

export type GuideFacts = {
  primaryFunctions: string[];
  primaryIndustries: string[];
  currentFunction: string | null;
  help: Array<{ type: string; level: string }>; // ordered, rank = position
  stagesBestAt: string[];
  transitions: string[];
  seniority: string;
  totalYears: number;
  mode: string;
  maxNewSeekersPerMonth: number;
  availability: string[];
  timezone: string;
};

export type StructuredParts = {
  helpOverlap: number;
  functionIndustry: number;
  availability: number;
  seniority: number;
  transition: number;
  stageFit: number;
  engagementMode: number;
};

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export function helpOverlap(seekerHelp: string[], guideHelp: GuideFacts["help"]): number {
  const w = MATCHING.helpRankWeights;
  let got = 0;
  let max = 0;
  seekerHelp.forEach((type, i) => {
    const weight = w[Math.min(i, w.length - 1)]!;
    max += weight;
    const idx = guideHelp.findIndex((h) => h.type === type);
    if (idx < 0) return;
    const level = MATCHING.helpLevelValue[guideHelp[idx]!.level as HelpLevel] ?? 0.5;
    const rankFactor = idx < 3 ? MATCHING.guideTopHelpBoost : MATCHING.guideLowerHelpFactor;
    got += weight * level * rankFactor;
  });
  return max === 0 ? 0 : clamp01(got / max);
}

export function functionIndustryFit(s: SeekerFacts, g: GuideFacts): number {
  const fn = g.primaryFunctions.includes(s.targetFunction) ? 1 : g.currentFunction === s.targetFunction ? 0.6 : 0;
  const hits = s.targetIndustries.filter((i) => g.primaryIndustries.includes(i)).length;
  const ind = s.targetIndustries.length ? hits / s.targetIndustries.length : 0;
  // Optional Seeker preferences nudge the score but never gate it.
  const prefFn = s.preferredFunctions.length && g.primaryFunctions.some((f) => s.preferredFunctions.includes(f)) ? 0.1 : 0;
  const prefInd = s.preferredIndustries.length && g.primaryIndustries.some((i) => s.preferredIndustries.includes(i)) ? 0.1 : 0;
  return clamp01(0.5 * fn + 0.5 * ind + prefFn + prefInd);
}

export function seniorityFit(seekerSeniority: string, guideSeniority: string): number {
  const order = SENIORITY.map((o) => o.value as string);
  const gap = order.indexOf(guideSeniority) - order.indexOf(seekerSeniority);
  if (gap >= 2) return 1;
  if (gap === 1) return 0.8;
  if (gap === 0) return 0.4;
  return 0;
}

const GOAL_TRANSITIONS: Record<string, string[]> = {
  switch_career: ["changed_industry", "changed_function", "non_tech_to_tech", "service_to_product", "studied_then_switched"],
  move_to_management: ["ic_to_manager"],
  start_business: ["started_business"],
  return_after_break: ["returned_after_break"],
  study_work_abroad: ["moved_abroad", "studied_then_switched"],
  grow_promotion: ["rapid_promotions"],
};

export function transitionFit(primaryGoal: string, guideTransitions: string[]): number {
  const wanted = GOAL_TRANSITIONS[primaryGoal];
  if (!wanted) return 0.5; // goal has no characteristic transition: neutral
  return wanted.some((t) => guideTransitions.includes(t)) ? 1 : 0;
}

export function engagementModeFit(s: SeekerFacts, g: GuideFacts): number {
  const mode = s.mode === g.mode || s.mode === "any" || g.mode === "any" ? 1 : 0.3;
  const engagement = s.engagementStyle === "ongoing" ? (g.maxNewSeekersPerMonth >= 3 ? 1 : 0.5) : s.engagementStyle === "few_sessions" ? (g.maxNewSeekersPerMonth >= 2 ? 1 : 0.7) : 1;
  return 0.5 * mode + 0.5 * engagement;
}

const PART_HOURS: Record<string, [number, number]> = { morning: [6, 12], afternoon: [12, 17], evening: [17, 21], night: [21, 24] };
const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

/** UTC offset in minutes for an IANA zone at a fixed reference instant (zone rules, not DST drift). */
export function offsetMinutes(timeZone: string, at = new Date("2025-01-15T12:00:00Z")): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric" }).formatToParts(at);
    const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
    const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
    return Math.round((asUtc - at.getTime()) / 60000);
  } catch {
    return 0;
  }
}

/** Weekly UTC hour indexes (0..167, Monday 00:00 UTC = 0) covered by local availability slots. */
export function utcHours(slots: string[], timeZone: string): Set<number> {
  const shiftHours = Math.round(offsetMinutes(timeZone) / 60);
  const out = new Set<number>();
  for (const slot of slots) {
    const [day, part] = slot.split(".");
    const dayIdx = DAYS.indexOf(day!);
    const range = PART_HOURS[part!];
    if (dayIdx < 0 || !range) continue;
    for (let h = range[0]; h < range[1]; h++) out.add((((dayIdx * 24 + h - shiftHours) % 168) + 168) % 168);
  }
  return out;
}

export function availabilityOverlap(s: Pick<SeekerFacts, "availability" | "timezone">, g: Pick<GuideFacts, "availability" | "timezone">): number {
  const a = utcHours(s.availability, s.timezone);
  const b = utcHours(g.availability, g.timezone);
  let shared = 0;
  for (const h of a) if (b.has(h)) shared++;
  return clamp01(shared / MATCHING.availabilityFullOverlapHours);
}

export function structuredScore(s: SeekerFacts, g: GuideFacts): { score: number; parts: StructuredParts } {
  const parts: StructuredParts = {
    helpOverlap: helpOverlap(s.helpNeeded, g.help),
    functionIndustry: functionIndustryFit(s, g),
    availability: availabilityOverlap(s, g),
    seniority: seniorityFit(s.seniority, g.seniority),
    transition: transitionFit(s.primaryGoal, g.transitions),
    stageFit: g.stagesBestAt.includes(s.careerStage) ? 1 : 0,
    engagementMode: engagementModeFit(s, g),
  };
  const w = MATCHING.structured;
  const weights = { ...w, transition: s.similarTransition ? w.transitionWhenRequested : w.transition };
  const keys = Object.keys(parts) as (keyof StructuredParts)[];
  const total = keys.reduce((sum, k) => sum + weights[k], 0);
  const score = keys.reduce((sum, k) => sum + weights[k] * parts[k], 0) / total;
  return { score: clamp01(score), parts };
}

/** Bayesian average of 1–5 ratings, so a single 5-star review cannot outrank an established Guide. */
export function bayesianRating(count: number, sum: number): number {
  const { priorMean, priorWeight } = MATCHING.rating;
  return (priorMean * priorWeight + sum) / (priorWeight + count);
}

export const ratingScore01 = (count: number, sum: number) => clamp01(bayesianRating(count, sum) / MATCHING.rating.scale);

/** Min-max normalisation across a candidate set; a flat set maps to 0.5. */
export function normalizeRange(values: number[]): number[] {
  const min = Math.min(...values);
  const max = Math.max(...values);
  return values.map((v) => (max - min < 1e-9 ? 0.5 : (v - min) / (max - min)));
}

export function blend(weights: Record<string, number>, values: Record<string, number>): number {
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  return Object.entries(weights).reduce((sum, [k, w]) => sum + w * (values[k] ?? 0), 0) / total;
}
