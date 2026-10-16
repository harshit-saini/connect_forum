import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { userRoles, users } from "@/server/db/schema";
import { processJobs } from "@/server/jobs/worker";
import { saveStep, submitProfile } from "@/server/profile/service";

/**
 * Seeds fake Seekers and Guides (fake e-mail addresses and fake phone numbers only) through the real
 * profile service, so derived columns and embedding jobs behave exactly as in production.
 * Idempotent: existing seed users are skipped.   Usage: pnpm seed [--guides 12] [--seekers 6]
 */
const arg = (name: string, def: number) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? Number(process.argv[i + 1]) : def;
};

const ADJ = ["Bright", "Calm", "Keen", "Bold", "Warm", "Swift", "Kind", "Steady", "Clever", "Brave", "Quiet", "Sunny"];
const NOUN = ["Falcon", "Maple", "River", "Lantern", "Compass", "Harbor", "Willow", "Summit", "Meadow", "Comet", "Otter", "Cedar"];

const GUIDE_TEMPLATES = [
  { fn: "product_management", ind: "fintech", help: ["career_switch", "interview_prep", "skill_roadmap"], stages: ["early_career", "career_switcher"], tr: ["changed_function", "ic_to_manager"], title: "Director of Product", years: 14, sen: "director", hire: "hired_managed", summary: "I moved from engineering into product management and have led product teams in fintech for over a decade. I have hired many product managers and enjoy helping engineers make the switch." },
  { fn: "software_engineering", ind: "it_software", help: ["interview_prep", "mock_interviews", "promotion_growth"], stages: ["early_career", "mid_career"], tr: ["rapid_promotions"], title: "Staff engineer", years: 11, sen: "lead", hire: "regular", summary: "I have spent eleven years building distributed systems, interviewing candidates and mentoring engineers towards senior and staff roles." },
  { fn: "data_analytics", ind: "data_ai", help: ["skill_roadmap", "career_switch", "resume_review"], stages: ["student", "recent_graduate", "career_switcher"], tr: ["non_tech_to_tech", "changed_industry"], title: "Analytics manager", years: 9, sen: "manager", hire: "regular", summary: "I started in operations, taught myself SQL and Python, and moved into analytics. I help career switchers build a realistic data skill roadmap." },
  { fn: "marketing", ind: "ecommerce_retail", help: ["job_search_strategy", "linkedin_branding", "salary_negotiation"], stages: ["mid_career", "between_jobs"], tr: ["changed_industry"], title: "Head of marketing", years: 15, sen: "director", hire: "hired_managed", summary: "Fifteen years in e-commerce marketing. I help mid-career professionals sharpen their personal brand, run a focused job search and negotiate offers." },
  { fn: "hr_people", ind: "consulting", help: ["resume_review", "interview_prep", "networking_referrals"], stages: ["student", "recent_graduate", "early_career"], tr: [], title: "Senior HR business partner", years: 10, sen: "senior", hire: "hired_managed", summary: "A decade in HR and talent acquisition. I review resumes daily and know what recruiters look for at the screening stage." },
  { fn: "finance_accounting", ind: "banking_financial", help: ["career_switch", "higher_studies", "work_abroad"], stages: ["early_career", "mid_career"], tr: ["moved_abroad", "studied_then_switched"], title: "Vice president, finance", years: 13, sen: "executive", hire: "regular", summary: "I moved abroad for an MBA and switched from audit to corporate finance. I advise on studying and working overseas." },
  { fn: "design", ind: "it_software", help: ["skill_roadmap", "resume_review", "freelancing_entrepreneurship"], stages: ["student", "recent_graduate", "career_switcher"], tr: ["non_tech_to_tech", "started_business"], title: "Principal designer", years: 12, sen: "lead", hire: "occasional", summary: "I came to UX from print design, later freelanced for years and now lead a design team. I help people build portfolios and decide between freelancing and a full-time role." },
  { fn: "operations", ind: "logistics_supply_chain", help: ["career_break_return", "job_search_strategy", "leadership_management"], stages: ["returning", "between_jobs", "mid_career"], tr: ["returned_after_break", "ic_to_manager"], title: "Operations director", years: 17, sen: "director", hire: "hired_managed", summary: "I returned to work after a two-year break and moved into operations leadership. I coach people returning after a career break." },
  { fn: "sales", ind: "it_software", help: ["salary_negotiation", "promotion_growth", "networking_referrals"], stages: ["early_career", "mid_career"], tr: ["rapid_promotions"], title: "Regional sales head", years: 12, sen: "director", hire: "regular", summary: "Twelve years in enterprise software sales. I help people grow into leadership and negotiate compensation." },
  { fn: "cybersecurity", ind: "banking_financial", help: ["skill_roadmap", "career_switch", "industry_insights"], stages: ["career_switcher", "early_career"], tr: ["changed_function"], title: "Security architect", years: 10, sen: "senior", hire: "occasional", summary: "I moved from network engineering into security and now design controls for a large bank. I share how the field really works." },
  { fn: "project_program_management", ind: "manufacturing_engineering", help: ["leadership_management", "interview_prep", "promotion_growth"], stages: ["mid_career", "senior"], tr: ["ic_to_manager"], title: "Program manager", years: 14, sen: "manager", hire: "regular", summary: "Fourteen years running large engineering programs. I coach engineers moving into management." },
  { fn: "research_academia", ind: "education_edtech", help: ["higher_studies", "work_abroad", "resume_review"], stages: ["student", "recent_graduate"], tr: ["studied_then_switched", "moved_abroad"], title: "Research scientist", years: 8, sen: "senior", hire: "occasional", summary: "I did my PhD abroad and moved to industry research. I help students plan postgraduate studies and applications." },
] as const;

const SEEKER_TEMPLATES = [
  { stage: "early_career", goal: "switch_career", roles: ["Product manager"], inds: ["fintech"], fn: "product_management", help: ["career_switch", "interview_prep", "skill_roadmap"], cur: { title: "Software engineer", fn: "software_engineering", ind: "it_software" }, challenge: "I am a software engineer with three years of experience who wants to move into product management. I do not know how to show relevant experience or which skills to build first." },
  { stage: "student", goal: "first_job", roles: ["Data analyst"], inds: ["data_ai"], fn: "data_analytics", help: ["resume_review", "skill_roadmap", "interview_prep"], cur: { title: "Student", fn: "data_analytics", ind: "data_ai" }, challenge: "I am in my final year studying statistics and want a first job as a data analyst. My resume has projects but no work experience and I am not sure how to stand out." },
  { stage: "returning", goal: "return_after_break", roles: ["Operations manager"], inds: ["logistics_supply_chain"], fn: "operations", help: ["career_break_return", "job_search_strategy", "resume_review"], cur: { title: "Operations lead", fn: "operations", ind: "logistics_supply_chain" }, challenge: "I took a two year break to care for family and want to return to operations. I worry about the gap on my resume and how recruiters will see it." },
  { stage: "mid_career", goal: "move_to_management", roles: ["Engineering manager"], inds: ["it_software"], fn: "software_engineering", help: ["leadership_management", "promotion_growth", "interview_prep"], cur: { title: "Senior software engineer", fn: "software_engineering", ind: "it_software" }, challenge: "I have been a senior engineer for six years and want to become an engineering manager. I have led projects but never managed people and I am unsure how to make the case." },
  { stage: "student", goal: "study_work_abroad", roles: ["Research scientist"], inds: ["education_edtech"], fn: "research_academia", help: ["higher_studies", "work_abroad", "resume_review"], cur: { title: "Student", fn: "research_academia", ind: "education_edtech" }, challenge: "I want to do a masters abroad and then work in research. I need help choosing programs, preparing applications and understanding visa and job options afterwards." },
  { stage: "mid_career", goal: "better_job", roles: ["Marketing director"], inds: ["ecommerce_retail"], fn: "marketing", help: ["job_search_strategy", "salary_negotiation", "linkedin_branding"], cur: { title: "Marketing manager", fn: "marketing", ind: "ecommerce_retail" }, challenge: "I am a marketing manager looking for a director role. My applications get few replies and I am not confident about negotiating compensation when offers do come." },
] as const;

const SUMMARY_TAIL = " I am happy to share what worked for me, what I would do differently, and how the hiring process looks from the other side.";

const slots = (i: number) => [["tue.evening", "sat.morning", "thu.evening"], ["wed.evening", "sun.morning", "mon.night"], ["tue.afternoon", "fri.evening", "sat.afternoon"]][i % 3]!;

async function ensureUser(email: string, role: "seeker" | "guide") {
  const [existing] = await db().select().from(users).where(eq(users.email, email));
  if (existing) return null;
  const [u] = await db().insert(users).values({ email, emailVerified: true }).returning();
  await db().insert(userRoles).values({ userId: u!.id, role });
  return u!;
}

async function must(label: string, p: Promise<{ ok: boolean }>) {
  const r = await p;
  if (!r.ok) throw new Error(`${label} failed: ${JSON.stringify(r)}`);
}

const basics = (alias: string, lang = ["english", "hindi"]) => ({
  alias, country: "IN", timezone: "Asia/Kolkata", languages: lang, consents: { terms: true, privacy: true, aiProcessing: true },
});

async function guarded(email: string, fn: () => Promise<boolean>) {
  try {
    return await fn();
  } catch (err) {
    await db().delete(users).where(eq(users.email, email)); // cascade: never leave a half-built seed user
    throw err;
  }
}

async function seedGuide(i: number) {
  const t = GUIDE_TEMPLATES[i % GUIDE_TEMPLATES.length]!;
  const u = await ensureUser(`seed-guide-${i + 1}@example.com`, "guide");
  if (!u) return false;
  const userId = u.id;
  const alias = `${ADJ[i % ADJ.length]}${NOUN[(i * 5) % NOUN.length]}${10 + i}`;
  const timeline = [{ title: `${t.title.split(" ")[0]} lead`, industry: t.ind, function: t.fn, startYear: 2015, endYear: null, summary: "Led a team and delivered several large initiatives." }];
  await must("basics", saveStep({ userId, role: "guide", step: "basics", values: basics(alias) }));
  await must("background", saveStep({ userId, role: "guide", step: "background", values: { status: "employed_full_time", jobTitle: t.title, industry: t.ind, function: t.fn, totalYears: t.years, yearsInFunction: Math.min(t.years, 8), seniority: t.sen, skills: ["Leadership", "Coaching", "Communication"], timeline } }));
  await must("expertise", saveStep({ userId, role: "guide", step: "expertise", values: { primaryFunctions: [t.fn], primaryIndustries: [t.ind], help: t.help.map((h, k) => ({ type: h, level: k === 0 ? "expert" : "solid" })), stagesBestAt: [...t.stages], transitions: [...t.tr], hiringExperience: t.hire, experienceSummary: t.summary + SUMMARY_TAIL } }));
  await must("availability", saveStep({ userId, role: "guide", step: "availability", values: { maxNewSeekersPerMonth: 4, availability: slots(i), sessionLength: "30", mode: "video", contactPreference: "call", bestTime: "Weekday evenings", acknowledgement: true }, phone: `+9190000000${String(i + 1).padStart(2, "0")}` }));
  await must("submit", submitProfile({ userId, role: "guide" }));
  return true;
}

async function seedSeeker(i: number) {
  const t = SEEKER_TEMPLATES[i % SEEKER_TEMPLATES.length]!;
  const u = await ensureUser(`seed-seeker-${i + 1}@example.com`, "seeker");
  if (!u) return false;
  const userId = u.id;
  const alias = `${ADJ[(i + 3) % ADJ.length]}${NOUN[(i * 7 + 2) % NOUN.length]}${50 + i}`;
  const student = t.stage === "student";
  await must("basics", saveStep({ userId, role: "seeker", step: "basics", values: basics(alias) }));
  await must("background", saveStep({ userId, role: "seeker", step: "background", values: { status: student ? "student" : "employed_full_time", jobTitle: t.cur.title, industry: t.cur.ind, function: t.cur.fn, totalYears: student ? 0 : 4, seniority: student ? "student" : "mid", skills: ["Excel", "SQL", "Communication"] } }));
  await must("goals", saveStep({ userId, role: "seeker", step: "goals", values: { careerStage: t.stage, primaryGoal: t.goal, targetRoles: [...t.roles], targetIndustries: [...t.inds], targetFunction: t.fn, timeline: "6_months", jobSearchStatus: "preparing", helpNeeded: [...t.help], challenge: t.challenge } }));
  await must("preferences", saveStep({ userId, role: "seeker", step: "preferences", values: { minGuideExperience: "5", mustShareLanguage: true, similarTransition: true, engagementStyle: "few_sessions", mode: "video", availability: slots(i) } }));
  await must("submit", submitProfile({ userId, role: "seeker" }));
  return true;
}

async function main() {
  const guides = arg("guides", 12);
  const seekers = arg("seekers", 6);
  let g = 0;
  let s = 0;
  for (let i = 0; i < guides; i++) if (await guarded(`seed-guide-${i + 1}@example.com`, () => seedGuide(i))) g++;
  for (let i = 0; i < seekers; i++) if (await guarded(`seed-seeker-${i + 1}@example.com`, () => seedSeeker(i))) s++;
  const jobs = await processJobs({ maxMs: 120_000, maxJobs: 500 }); // compute embeddings now
  console.log(`seeded ${g} guides and ${s} seekers (${jobs} jobs processed). Sign in as seed-seeker-1@example.com or seed-guide-1@example.com`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
