import { z } from "zod";
import {
  CAREER_STAGES, CONTACT_PREFERENCES, HELP_LEVELS, HELP_TYPES, HIRING_EXPERIENCE, MODES, SESSION_LENGTHS, TRANSITIONS,
  FUNCTIONS, INDUSTRIES,
} from "@/config/taxonomy";
import { availability, enumOf, freeText, optionalFreeText } from "./common";
import { backgroundSchema, basicsSchema } from "./shared-steps";

export const E164 = /^\+[1-9]\d{6,14}$/;

export const guideExpertiseSchema = z.object({
  primaryFunctions: z.array(enumOf(FUNCTIONS)).min(1, "Pick at least 1").max(3, "At most 3"),
  primaryIndustries: z.array(enumOf(INDUSTRIES)).min(1, "Pick at least 1").max(3, "At most 3"),
  /** Ordered by strength: the first three are the Guide's ranked top areas. */
  help: z
    .array(z.object({ type: enumOf(HELP_TYPES), level: enumOf(HELP_LEVELS) }))
    .min(2, "Pick at least 2 areas")
    .max(8, "At most 8 areas")
    .refine((h) => new Set(h.map((x) => x.type)).size === h.length, "Duplicates"),
  stagesBestAt: z.array(enumOf(CAREER_STAGES)).min(1, "Pick at least 1 stage"),
  transitions: z.array(enumOf(TRANSITIONS)).optional().default([]),
  hiringExperience: enumOf(HIRING_EXPERIENCE),
  experienceSummary: freeText(100, 1000),
  helpStyle: optionalFreeText(500),
  wontHelpWith: z
    .object({ types: z.array(enumOf(HELP_TYPES)).default([]), note: optionalFreeText(200) })
    .optional(),
  whyHelp: optionalFreeText(300),
});

export const guideAvailabilitySchema = z.object({
  maxNewSeekersPerMonth: z.number({ error: "Enter a number" }).int().min(1).max(10),
  availability,
  sessionLength: enumOf(SESSION_LENGTHS),
  mode: enumOf(MODES),
  contactPreference: enumOf(CONTACT_PREFERENCES),
  bestTime: freeText(1, 100),
  pauseMatching: z.boolean().default(false),
  acknowledgement: z.literal(true, { error: "Required to continue" }),
});

/**
 * Phone input for the availability step. It is handled outside `data`: it goes to the vault, never to a
 * draft or profile row. Optional here because a number saved earlier counts.
 */
export const phoneInputSchema = z.object({
  phone: z.string().regex(E164, "Enter a valid number with country code").optional(),
});

export function guideProfileSchema() {
  return z.object({
    basics: basicsSchema,
    background: backgroundSchema("guide"),
    expertise: guideExpertiseSchema,
    availability: guideAvailabilitySchema,
  });
}
