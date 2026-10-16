import {
  CAREER_STAGES, FUNCTIONS, HELP_LEVELS, HELP_TYPES, HIRING_EXPERIENCE, INDUSTRIES, PRIMARY_GOALS, SENIORITY, TIMELINES, TRANSITIONS, JOB_SEARCH_STATUS, labelOf,
} from "@/config/taxonomy";
import type { GuideProfileData, SeekerProfileData } from "@/schemas";

/**
 * What the other side may see (PUB fields). This is the ONLY projection of a profile that is sent to
 * the AI or returned by match and request APIs. Alias, contact data, PRIV fields, exclusions and
 * company names are never included. The alias is added by callers that render a card, not here.
 */
export type PublicGuide = {
  title: string;
  years: number;
  seniority: string;
  industries: string[];
  functions: string[];
  help: Array<{ type: string; level: string }>;
  stages: string[];
  transitions: string[];
  hiring: string;
  summary: string;
  style?: string;
  past: string[];
  skills: string[];
};

export function publicGuide(d: GuideProfileData): PublicGuide {
  const { background: b, expertise: e } = d;
  return {
    title: b.jobTitle,
    years: b.totalYears,
    seniority: labelOf(SENIORITY, b.seniority),
    industries: e.primaryIndustries.map((i) => labelOf(INDUSTRIES, i)),
    functions: e.primaryFunctions.map((f) => labelOf(FUNCTIONS, f)),
    help: e.help.slice(0, 5).map((h) => ({ type: labelOf(HELP_TYPES, h.type), level: labelOf(HELP_LEVELS, h.level).toLowerCase() })),
    stages: e.stagesBestAt.map((s) => labelOf(CAREER_STAGES, s)),
    transitions: (e.transitions ?? []).map((t) => labelOf(TRANSITIONS, t)),
    hiring: labelOf(HIRING_EXPERIENCE, e.hiringExperience),
    summary: e.experienceSummary,
    style: e.helpStyle,
    past: (b.timeline ?? []).map((t) => `${t.title} (${labelOf(INDUSTRIES, t.industry)}): ${t.summary}`),
    skills: b.skills.slice(0, 10),
  };
}

export type PublicSeeker = {
  currentRole: string;
  years: number;
  stage: string;
  goal: string;
  targetRoles: string[];
  targetIndustries: string[];
  targetFunction: string;
  timeline: string;
  searchStatus: string;
  helpNeeded: string[]; // ranked
  challenge: string;
  triedSoFar?: string;
  desiredOutcome?: string;
  questions: string[];
  skills: string[];
};

export function publicSeeker(d: SeekerProfileData): PublicSeeker {
  const { background: b, goals: g } = d;
  return {
    currentRole: `${b.jobTitle}, ${labelOf(INDUSTRIES, b.industry)}, ${labelOf(FUNCTIONS, b.function)}`,
    years: b.totalYears,
    stage: labelOf(CAREER_STAGES, g.careerStage),
    goal: labelOf(PRIMARY_GOALS, g.primaryGoal),
    targetRoles: g.targetRoles,
    targetIndustries: g.targetIndustries.map((i) => labelOf(INDUSTRIES, i)),
    targetFunction: labelOf(FUNCTIONS, g.targetFunction),
    timeline: labelOf(TIMELINES, g.timeline),
    searchStatus: labelOf(JOB_SEARCH_STATUS, g.jobSearchStatus),
    helpNeeded: g.helpNeeded.map((h) => labelOf(HELP_TYPES, h)),
    challenge: g.challenge,
    triedSoFar: g.triedSoFar,
    desiredOutcome: g.desiredOutcome,
    questions: g.questions ?? [],
    skills: b.skills.slice(0, 10),
  };
}
