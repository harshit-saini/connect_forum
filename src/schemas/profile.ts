import { z } from "zod";
import { CATEGORIES } from "@/config/taxonomy";
import { MEMBER_ID_SHAPE, normalizeMemberId } from "@/lib/member-id";
import { roleTitleProblem } from "@/lib/screening";
import { enumOf, freeText, years } from "./common";

export const E164 = /^\+[1-9]\d{6,14}$/;

/** Shape only. Whether the ID is on the allow-list is checked on the server (src/server/members.ts). */
const memberId = z
  .string()
  .transform(normalizeMemberId)
  .pipe(z.string().min(1, "Enter your member ID").regex(MEMBER_ID_SHAPE, "That doesn't look like a member ID"));

/** One checkbox covers the Terms, Privacy policy and AI processing consents. */
const agree = z.literal(true, { error: "Required to continue" });

export const seekerFormSchema = z.object({
  memberId,
  category: enumOf(CATEGORIES),
  /** The Seeker's question, in their own words. Screened for contact details. */
  query: freeText(20, 600),
  totalYears: years,
  agree,
});

export const guideFormSchema = z.object({
  memberId,
  categories: z.array(enumOf(CATEGORIES)).min(1, "Pick at least 1 category").max(CATEGORIES.length),
  /** Shown to Seekers as the Guide's name, so it must be a role and not a person. */
  jobTitle: freeText(2, 80).superRefine((v, ctx) => {
    const problem = roleTitleProblem(v);
    if (problem) ctx.addIssue({ code: "custom", message: problem });
  }),
  totalYears: years,
  about: freeText(30, 500),
  /** Include the Guide's email address in the e-mail to Seekers who connect. Their choice; not a matching field. */
  shareEmail: z.boolean(),
  agree,
});

/** What is stored in `data`: the form answers minus the member ID (its own column) and the consent box. */
export type SeekerProfileData = Omit<z.output<typeof seekerFormSchema>, "memberId" | "agree"> & { consentedAt: string };
export type GuideProfileData = Omit<z.output<typeof guideFormSchema>, "memberId" | "agree"> & { consentedAt: string };
export type ProfileData = SeekerProfileData | GuideProfileData;
export type Role = "seeker" | "guide";

export function formSchema(role: Role) {
  return role === "seeker" ? seekerFormSchema : guideFormSchema;
}

/** Phone input for the Guide form. Handled outside `data`: it goes to the vault, never to a profile row. */
export const phoneInputSchema = z.object({ phone: z.string().regex(E164, "Enter a valid number with country code").optional() });
