import type { z } from "zod";
import { guideAvailabilitySchema, guideExpertiseSchema, guideProfileSchema, phoneInputSchema } from "./guide";
import { seekerGoalsSchema, seekerPreferencesSchema, seekerProfileSchema } from "./seeker";
import { backgroundSchema, basicsSchema } from "./shared-steps";

export type Role = "seeker" | "guide";
export type StepKey = "basics" | "background" | "goals" | "preferences" | "expertise" | "availability" | "review";

export const STEP_ORDER: Record<Role, StepKey[]> = {
  seeker: ["basics", "background", "goals", "preferences", "review"],
  guide: ["basics", "background", "expertise", "availability", "review"],
};

export const STEP_TITLES: Record<StepKey, string> = {
  basics: "Basics",
  background: "Professional background",
  goals: "Goals and needs",
  preferences: "Preferences",
  expertise: "Expertise",
  availability: "Availability and contact",
  review: "Review and submit",
};

/** The zod schema validating one data step (not "review"). */
export function stepSchema(role: Role, step: Exclude<StepKey, "review">): z.ZodType {
  switch (step) {
    case "basics": return basicsSchema;
    case "background": return backgroundSchema(role);
    case "goals": return seekerGoalsSchema;
    case "preferences": return seekerPreferencesSchema;
    case "expertise": return guideExpertiseSchema;
    case "availability": return guideAvailabilitySchema;
  }
}

export function profileSchema(role: Role) {
  return role === "seeker" ? seekerProfileSchema() : guideProfileSchema();
}

export type SeekerProfileData = z.output<ReturnType<typeof seekerProfileSchema>>;
export type GuideProfileData = z.output<ReturnType<typeof guideProfileSchema>>;
export type ProfileData = SeekerProfileData | GuideProfileData;

export { phoneInputSchema };
export * from "./common";
