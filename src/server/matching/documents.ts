import "server-only";
import {
  CAREER_STAGES, EDUCATION, EMPLOYMENT_STATUS, FUNCTIONS, HELP_LEVELS, HELP_TYPES, HIRING_EXPERIENCE, INDUSTRIES,
  PRIMARY_GOALS, SENIORITY, TRANSITIONS, labelOf,
} from "@/config/taxonomy";
import type { GuideProfileData, SeekerProfileData } from "@/schemas";

/**
 * Bump when the document layout changes. It is stored with every vector so old vectors can be
 * found and re-embedded.
 */
export const DOC_TEMPLATE_VERSION = 1;

const list = (items: string[] | undefined, map: (v: string) => string) => (items?.length ? items.map(map).join(", ") : "");

function lines(entries: Array<[string, string | undefined]>): string {
  return entries
    .filter(([, v]) => v && v.trim())
    .map(([k, v]) => `${k}: ${v!.trim()}`)
    .join("\n");
}

/**
 * Deterministic text for a Seeker. Deliberately excludes the alias, city, LinkedIn, excluded companies,
 * consents, preferences and anything else private. Free text is included verbatim (it is screened for
 * contact details on input) and is treated as data by the model.
 */
export function buildNeedsDoc(d: SeekerProfileData): string {
  const { background: b, goals: g } = d;
  return lines([
    ["Career stage", labelOf(CAREER_STAGES, g.careerStage)],
    ["Primary goal", labelOf(PRIMARY_GOALS, g.primaryGoal)],
    ["Target roles", g.targetRoles.join(", ")],
    ["Target industries", list(g.targetIndustries, (v) => labelOf(INDUSTRIES, v))],
    ["Target function", labelOf(FUNCTIONS, g.targetFunction)],
    ["Help needed, most important first", g.helpNeeded.map((h, i) => `${i + 1}. ${labelOf(HELP_TYPES, h)}`).join("; ")],
    ["Biggest challenge", g.challenge],
    ["Already tried", g.triedSoFar],
    ["Desired outcome", g.desiredOutcome],
    ["Questions for a guide", g.questions?.join(" | ")],
    ["Current situation", `${labelOf(EMPLOYMENT_STATUS, b.status)}; ${b.jobTitle}; ${labelOf(INDUSTRIES, b.industry)}; ${labelOf(FUNCTIONS, b.function)}; ${b.totalYears} years; ${labelOf(SENIORITY, b.seniority)}`],
    ["Education", [b.education && labelOf(EDUCATION, b.education), b.fieldOfStudy].filter(Boolean).join(", ")],
    ["Skills", b.skills.join(", ")],
  ]);
}

/** Deterministic text for a Guide. Excludes alias, contact data, phone, excluded companies and other private fields. */
export function buildOffersDoc(d: GuideProfileData): string {
  const { background: b, expertise: e } = d;
  return lines([
    ["Functions", list(e.primaryFunctions, (v) => labelOf(FUNCTIONS, v))],
    ["Industries", list(e.primaryIndustries, (v) => labelOf(INDUSTRIES, v))],
    ["Can help with, strongest first", e.help.map((h, i) => `${i + 1}. ${labelOf(HELP_TYPES, h.type)} (${labelOf(HELP_LEVELS, h.level).toLowerCase()})`).join("; ")],
    ["Best at helping stages", list(e.stagesBestAt, (v) => labelOf(CAREER_STAGES, v))],
    ["Transitions made", list(e.transitions, (v) => labelOf(TRANSITIONS, v))],
    ["Hiring experience", labelOf(HIRING_EXPERIENCE, e.hiringExperience)],
    ["Experience summary", e.experienceSummary],
    ["How I like to help", e.helpStyle],
    ["Why I help", e.whyHelp],
    ["Current role", `${b.jobTitle}; ${labelOf(INDUSTRIES, b.industry)}; ${labelOf(FUNCTIONS, b.function)}; ${b.totalYears} years; ${labelOf(SENIORITY, b.seniority)}`],
    ["Career timeline", (b.timeline ?? []).map((t) => `${t.title} (${labelOf(INDUSTRIES, t.industry)}, ${labelOf(FUNCTIONS, t.function)}, ${t.startYear}-${t.endYear ?? "now"}): ${t.summary}`).join(" | ")],
    ["Education", [b.education && labelOf(EDUCATION, b.education), b.fieldOfStudy].filter(Boolean).join(", ")],
    ["Skills", b.skills.join(", ")],
  ]);
}
