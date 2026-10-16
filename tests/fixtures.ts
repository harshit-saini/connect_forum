import { randomUUID } from "node:crypto";
import { db } from "@/server/db/client";
import { users, userRoles } from "@/server/db/schema";

export async function createUser(role?: "seeker" | "guide", email = `u-${randomUUID()}@example.com`) {
  const [u] = await db().insert(users).values({ email, emailVerified: true }).returning();
  if (role) await db().insert(userRoles).values({ userId: u!.id, role });
  return u!;
}

export const uniqueAlias = (p = "Test") => `${p}${Math.random().toString(36).slice(2, 8)}`;

const basics = (alias: string) => ({
  alias,
  country: "IN",
  timezone: "Asia/Kolkata",
  languages: ["english", "hindi"],
  consents: { terms: true, privacy: true, aiProcessing: true },
});

const role = {
  title: "Backend developer",
  industry: "it_software",
  function: "software_engineering",
  startYear: 2018,
  endYear: null,
  summary: "Built payment APIs for a retail platform",
};

const background = (extra: object = {}) => ({
  status: "employed_full_time",
  jobTitle: "Software engineer",
  industry: "it_software",
  function: "software_engineering",
  companyType: "mnc",
  totalYears: 6,
  yearsInFunction: 5,
  seniority: "senior",
  skills: ["Python", "SQL", "AWS"],
  timeline: [role],
  excludedCompanies: ["Acme Pvt Ltd"],
  ...extra,
});

export const seekerSteps = (alias = uniqueAlias("Seek")) => ({
  basics: basics(alias),
  background: background({ totalYears: 2, yearsInFunction: 2, seniority: "entry", timeline: [] }),
  goals: {
    careerStage: "early_career",
    primaryGoal: "switch_career",
    targetRoles: ["Product manager"],
    targetIndustries: ["fintech"],
    targetFunction: "product_management",
    timeline: "6_months",
    jobSearchStatus: "preparing",
    helpNeeded: ["career_switch", "interview_prep", "skill_roadmap"],
    challenge: "I am an engineer who wants to move into product management but I do not know how to show relevant experience.",
  },
  preferences: {
    minGuideExperience: "5",
    mustShareLanguage: true,
    similarTransition: true,
    engagementStyle: "few_sessions",
    mode: "video",
    availability: ["tue.evening", "sat.morning"],
  },
});

export const guideSteps = (alias = uniqueAlias("Guide")) => ({
  basics: basics(alias),
  background: background({ totalYears: 12, yearsInFunction: 8, seniority: "manager" }),
  expertise: {
    primaryFunctions: ["product_management"],
    primaryIndustries: ["fintech"],
    help: [
      { type: "career_switch", level: "expert" },
      { type: "interview_prep", level: "solid" },
    ],
    stagesBestAt: ["early_career", "career_switcher"],
    transitions: ["changed_function"],
    hiringExperience: "regular",
    experienceSummary:
      "I moved from engineering into product management a decade ago and have since led product teams, interviewed many candidates and mentored several career switchers.",
  },
  availability: {
    maxNewSeekersPerMonth: 3,
    availability: ["tue.evening", "wed.evening"],
    sessionLength: "30",
    mode: "video",
    contactPreference: "call",
    bestTime: "Weekday evenings",
    acknowledgement: true,
  },
});
