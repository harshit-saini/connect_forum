import { describe, expect, it } from "vitest";
import { CONTACT_ERROR, normalizeCompany, screenText } from "@/lib/screening";
import { seekerGoalsSchema } from "@/schemas/seeker";
import { backgroundSchema, basicsSchema } from "@/schemas/shared-steps";

const blocked = (t: string) => screenText(t).errors.includes(CONTACT_ERROR);

describe("screenText: contact details are blocked", () => {
  it.each([
    "mail me at jane.doe@gmail.com",
    "jane (at) gmail (dot) com",
    "reach me jane at gmail dot com",
    "see https://example.com/me",
    "visit www.mysite.in",
    "my site is janedoe.io/portfolio",
    "ping me @janedoe on there",
    "add me on WhatsApp",
    "my telegram is on my card",
    "linkedin: janedoe99",
    "call +91 98765 43210",
    "call 98765-43210",
    "9876543210",
    "+919876543210",
  ])("blocks %s", (t) => expect(blocked(t)).toBe(true));

  it.each([
    "I worked from 2018 to 2022 at a startup",
    "years 2018 2019 2020 2021",
    "I have 10 years of experience, 3 in data",
    "Built apps with Node.js and Next.js",
    "My salary was 12000000 per year",
    "I use LinkedIn to find roles",
    "Team of 25 people, budget 1,200,000",
    "Looking to move from QA to product management",
  ])("allows %s", (t) => expect(blocked(t)).toBe(false));
});

describe("screenText: warnings", () => {
  it("warns about names and company suffixes without blocking", () => {
    const r = screenText("My name is Priya Sharma and I worked at Acme Technologies");
    expect(r.errors).toEqual([]);
    expect(r.warnings.length).toBeGreaterThanOrEqual(2);
  });
});

describe("normalizeCompany", () => {
  it("makes variants comparable", () => {
    expect(normalizeCompany("Google LLC")).toBe(normalizeCompany("google"));
    expect(normalizeCompany("Tata Consultancy Services Ltd.")).toBe("tataconsultancyservices");
  });
});

describe("schemas apply screening", () => {
  it("rejects contact details in the seeker challenge", () => {
    const r = seekerGoalsSchema.shape.challenge.safeParse("x".repeat(60) + " email me at a@b.com");
    expect(r.success).toBe(false);
  });
  it("requires all three consents and a valid alias", () => {
    const base = { alias: "ab", country: "IN", timezone: "Asia/Kolkata", languages: ["english"], consents: { terms: true, privacy: true, aiProcessing: false } };
    const r = basicsSchema.safeParse(base);
    expect(r.success).toBe(false);
    const paths = r.success ? [] : r.error.issues.map((i) => i.path.join("."));
    expect(paths).toContain("alias");
    expect(paths).toContain("consents.aiProcessing");
  });
  it("requires a past role for guides but not seekers", () => {
    const v = { status: "employed_full_time", jobTitle: "Engineer", industry: "it_software", function: "software_engineering", totalYears: 5, seniority: "senior", skills: ["a", "b", "c"], timeline: [] };
    expect(backgroundSchema("guide").safeParse(v).success).toBe(false);
    expect(backgroundSchema("seeker").safeParse(v).success).toBe(true);
  });
  it("rejects years in function above total experience", () => {
    const v = { status: "student", jobTitle: "Student", industry: "it_software", function: "other", totalYears: 2, yearsInFunction: 5, seniority: "student", skills: ["a", "b", "c"] };
    expect(backgroundSchema("seeker").safeParse(v).success).toBe(false);
  });
  it("only accepts linkedin.com URLs", () => {
    const base = { status: "student", jobTitle: "Student", industry: "it_software", function: "other", totalYears: 1, seniority: "student", skills: ["a", "b", "c"] };
    expect(backgroundSchema("seeker").safeParse({ ...base, linkedinUrl: "https://evil.com/in/x" }).success).toBe(false);
    expect(backgroundSchema("seeker").safeParse({ ...base, linkedinUrl: "https://www.linkedin.com/in/x" }).success).toBe(true);
  });
});
