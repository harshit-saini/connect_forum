import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { processJobs } from "@/server/jobs/worker";
import { saveProfile } from "@/server/profile/service";

/**
 * Seeds fake Seekers and Guides (fake e-mail addresses and fake phone numbers only) through the real
 * profile service, so derived columns and embedding jobs behave exactly as in production. The member-ID
 * check applies: add SEED-GUIDE-1..N to GUIDE_MEMBER_IDS and SEED-SEEKER-1..N to SEEKER_MEMBER_IDS first.
 * Idempotent: existing seed users are skipped.   Usage: pnpm seed [--guides 12] [--seekers 6]
 */
const arg = (name: string, def: number) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? Number(process.argv[i + 1]) : def;
};

const GUIDES = [
  { title: "Director of Product", years: 14, categories: ["career_stagnation", "uncertainty"], about: "I moved from engineering into product and have led product teams for over a decade. I help people who feel stuck decide whether to move up, across or out." },
  { title: "Staff engineer", years: 11, categories: ["career_stagnation", "upskilling_training"], about: "Eleven years building systems and mentoring engineers towards senior roles. I help with choosing what to learn next and how to show growth." },
  { title: "Analytics manager", years: 9, categories: ["upskilling_training", "uncertainty"], about: "I started in operations, taught myself SQL and Python, and moved into analytics. I help people pick a realistic learning path." },
  { title: "Head of marketing", years: 15, categories: ["layoff_unemployment", "career_stagnation"], about: "Fifteen years in marketing, including two restructurings. I help people through a layoff and plan a focused job search." },
  { title: "Senior HR business partner", years: 10, categories: ["layoff_unemployment", "uncertainty"], about: "A decade in HR and talent acquisition. I know what recruiters look for and how to explain a gap or a layoff." },
  { title: "Vice president, finance", years: 13, categories: ["uncertainty", "upskilling_training"], about: "I switched from audit to corporate finance after an MBA abroad. I help people weigh a change of direction." },
  { title: "Principal designer", years: 12, categories: ["upskilling_training", "career_stagnation"], about: "I came to design from print, freelanced for years, and now lead a team. I help people build skills and portfolios." },
  { title: "Operations director", years: 17, categories: ["layoff_unemployment", "uncertainty"], about: "I returned to work after a two-year break and moved into operations leadership. I coach people restarting after a setback." },
  { title: "Regional sales head", years: 12, categories: ["career_stagnation"], about: "Twelve years in enterprise sales. I help people grow into leadership and ask for the next role." },
  { title: "Security architect", years: 10, categories: ["upskilling_training"], about: "I moved from network engineering into security. I share how the field really works and what to learn first." },
  { title: "Program manager", years: 14, categories: ["career_stagnation", "layoff_unemployment"], about: "Fourteen years running large programs. I coach people moving into management or back into work." },
  { title: "Research scientist", years: 8, categories: ["uncertainty", "upskilling_training"], about: "I did my PhD abroad and moved to industry research. I help students and early professionals plan next steps." },
] as const;

const SEEKERS = [
  { category: "career_stagnation", years: 6, query: "I have been a senior engineer for six years and want to become a manager, but I have never managed people and I am unsure how to make the case." },
  { category: "layoff_unemployment", years: 8, query: "I was laid off last month after a restructuring. I am not sure how to explain it in interviews or where to start my search." },
  { category: "upskilling_training", years: 3, query: "I want to move from operations into data analytics and need help choosing which skills and courses are worth my time." },
  { category: "uncertainty", years: 10, query: "I am not sure whether to stay in my field or change direction entirely. I would like to talk to someone who has done it." },
  { category: "layoff_unemployment", years: 4, query: "I have been out of work for four months and my applications get few replies. I would like advice on my resume and approach." },
  { category: "career_stagnation", years: 12, query: "My role has not changed in five years and I do not know whether to push for a promotion or look elsewhere." },
] as const;

async function ensureUser(email: string) {
  const [existing] = await db().select().from(users).where(eq(users.email, email));
  if (existing) return null;
  const [u] = await db().insert(users).values({ email, emailVerified: true }).returning();
  return u!;
}

async function guarded(email: string, fn: () => Promise<boolean>) {
  try {
    return await fn();
  } catch (err) {
    await db().delete(users).where(eq(users.email, email)); // cascade: never leave a half-built seed user
    throw err;
  }
}

/** Seed IDs must be on the allow-lists too: pnpm seed prints the ones to add to .env. */
const seedGuideId = (i: number) => `SEED-GUIDE-${i + 1}`;
const seedSeekerId = (i: number) => `SEED-SEEKER-${i + 1}`;

async function seedGuide(i: number) {
  const t = GUIDES[i % GUIDES.length]!;
  const u = await ensureUser(`seed-guide-${i + 1}@example.com`);
  if (!u) return false;
  const r = await saveProfile({
    userId: u.id, role: "guide", phone: `+9190000000${String(i + 1).padStart(2, "0")}`,
    values: { memberId: seedGuideId(i), categories: [...t.categories], jobTitle: t.title, totalYears: t.years, about: t.about, agree: true },
  });
  if (!r.ok) throw new Error(`guide ${i + 1}: ${JSON.stringify(r.fieldErrors)}`);
  return true;
}

async function seedSeeker(i: number) {
  const t = SEEKERS[i % SEEKERS.length]!;
  const u = await ensureUser(`seed-seeker-${i + 1}@example.com`);
  if (!u) return false;
  const r = await saveProfile({
    userId: u.id, role: "seeker",
    values: { memberId: seedSeekerId(i), category: t.category, query: t.query, totalYears: t.years, agree: true },
  });
  if (!r.ok) throw new Error(`seeker ${i + 1}: ${JSON.stringify(r.fieldErrors)}`);
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
  console.log(`(member IDs used: SEED-GUIDE-1.. and SEED-SEEKER-1..; they must be on the allow-lists)\nseeded ${g} guides and ${s} seekers (${jobs} jobs processed). Sign in as seed-seeker-1@example.com or seed-guide-1@example.com`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
