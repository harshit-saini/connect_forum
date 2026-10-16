import { z } from "zod";
import {
  CAREER_STAGES, ENGAGEMENT_STYLES, FUNCTIONS, HELP_TYPES, INDUSTRIES, JOB_SEARCH_STATUS, MIN_GUIDE_EXPERIENCE,
  MODES, PRIMARY_GOALS, TIMELINES, WEEKLY_COMMITMENT,
} from "@/config/taxonomy";
import { availability, enumOf, freeText, optionalFreeText } from "./common";
import { backgroundSchema, basicsSchema } from "./shared-steps";

const unique = <T,>(a: T[]) => new Set(a).size === a.length;

export const seekerGoalsSchema = z.object({
  careerStage: enumOf(CAREER_STAGES),
  primaryGoal: enumOf(PRIMARY_GOALS),
  targetRoles: z.array(freeText(2, 80)).min(1, "Add at least one target role").max(3, "At most 3 roles"),
  targetIndustries: z.array(enumOf(INDUSTRIES)).min(1, "Pick at least 1 industry").max(3, "At most 3 industries"),
  targetFunction: enumOf(FUNCTIONS),
  timeline: enumOf(TIMELINES),
  jobSearchStatus: enumOf(JOB_SEARCH_STATUS),
  /** Ordered by importance: the first three are the Seeker's ranked top needs. */
  helpNeeded: z.array(enumOf(HELP_TYPES)).min(1, "Pick at least 1 kind of help").max(6, "At most 6").refine(unique, "Duplicates"),
  challenge: freeText(50, 800),
  triedSoFar: optionalFreeText(500),
  desiredOutcome: optionalFreeText(500),
  questions: z.array(freeText(1, 150)).max(3).optional().default([]),
});

export const seekerPreferencesSchema = z.object({
  preferredGuideIndustries: z.array(enumOf(INDUSTRIES)).max(24).optional().default([]),
  preferredGuideFunctions: z.array(enumOf(FUNCTIONS)).max(26).optional().default([]),
  minGuideExperience: enumOf(MIN_GUIDE_EXPERIENCE).default("0"),
  mustShareLanguage: z.boolean().default(true),
  similarTransition: z.boolean().default(false),
  engagementStyle: enumOf(ENGAGEMENT_STYLES),
  mode: enumOf(MODES),
  availability,
  weeklyCommitment: enumOf(WEEKLY_COMMITMENT).optional(),
});

export function seekerProfileSchema() {
  return z.object({
    basics: basicsSchema,
    background: backgroundSchema("seeker"),
    goals: seekerGoalsSchema,
    preferences: seekerPreferencesSchema,
  });
}
