import { z } from "zod";
import {
  COMPANY_TYPES, EDUCATION, EMPLOYMENT_STATUS, FUNCTIONS, INDUSTRIES, SENIORITY,
} from "@/config/taxonomy";
import { country, enumOf, freeText, optionalFreeText, timezone, years } from "./common";

const thisYear = new Date().getFullYear();

export const basicsSchema = z.object({
  alias: z
    .string()
    .trim()
    .min(3, "At least 3 characters")
    .max(24, "At most 24 characters")
    .regex(/^[A-Za-z0-9 _-]+$/, "Letters, numbers, spaces, _ and - only"),
  country,
  city: optionalFreeText(60),
  timezone,
  languages: z.array(z.string().min(2).max(40)).min(1, "Pick at least 1 language").max(6, "Pick at most 6 languages"),
  consents: z.object({
    terms: z.literal(true, { error: "Required to continue" }),
    privacy: z.literal(true, { error: "Required to continue" }),
    aiProcessing: z.literal(true, { error: "Required to continue" }),
  }),
});

export const timelineItem = z
  .object({
    title: freeText(2, 80),
    industry: enumOf(INDUSTRIES),
    function: enumOf(FUNCTIONS),
    startYear: z.number({ error: "Enter a year" }).int().min(1960).max(thisYear),
    /** null means "current". */
    endYear: z.number().int().min(1960).max(thisYear + 1).nullable(),
    summary: freeText(1, 200),
  })
  .refine((t) => t.endYear === null || t.endYear >= t.startYear, { path: ["endYear"], message: "End year is before start year" });

const linkedinUrl = z
  .string()
  .trim()
  .url("Enter a full URL, e.g. https://www.linkedin.com/in/your-name")
  .refine((u) => {
    try {
      const h = new URL(u).hostname.toLowerCase();
      return h === "linkedin.com" || h.endsWith(".linkedin.com");
    } catch {
      return false;
    }
  }, "Must be a linkedin.com address");

export function backgroundSchema(role: "seeker" | "guide") {
  return z
    .object({
      status: enumOf(EMPLOYMENT_STATUS),
      jobTitle: freeText(2, 80),
      industry: enumOf(INDUSTRIES),
      function: enumOf(FUNCTIONS),
      companyType: enumOf(COMPANY_TYPES).optional(),
      totalYears: years,
      yearsInFunction: years.optional(),
      seniority: enumOf(SENIORITY),
      education: enumOf(EDUCATION).optional(),
      fieldOfStudy: optionalFreeText(80),
      skills: z.array(freeText(1, 40)).min(3, "Add at least 3 skills").max(15, "At most 15 skills"),
      timeline:
        role === "guide"
          ? z.array(timelineItem).min(1, "Add at least one past role").max(6)
          : z.array(timelineItem).max(6).optional().default([]),
      excludedCompanies: z.array(z.string().trim().min(1).max(60)).max(10, "At most 10 companies").optional().default([]),
      linkedinUrl: linkedinUrl.optional(),
    })
    .refine((v) => v.yearsInFunction === undefined || v.yearsInFunction <= v.totalYears, {
      path: ["yearsInFunction"],
      message: "Can't be more than total experience",
    });
}
