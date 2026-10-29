import { describe, expect, it } from "vitest";
import { CONTACT_ERROR, normalizeCompany, screenText } from "@/lib/screening";
import { guideFormSchema, seekerFormSchema } from "@/schemas";

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
  const seeker = { memberId: "seek-1001", category: "uncertainty", query: "I am not sure what to do next in my career.", totalYears: 4, agree: true };
  const guide = { memberId: "guide-1001", categories: ["uncertainty"], jobTitle: "Manager", totalYears: 10, about: "I have helped many people choose their next step.", shareEmail: true, agree: true };

  it("accepts a complete seeker form and normalises the member ID", () => {
    const r = seekerFormSchema.safeParse(seeker);
    expect(r.success && r.data.memberId).toBe("SEEK-1001");
  });
  it("rejects contact details in the seeker question and the guide's about text", () => {
    expect(seekerFormSchema.safeParse({ ...seeker, query: seeker.query + " email me at a@b.com" }).success).toBe(false);
    expect(guideFormSchema.safeParse({ ...guide, about: guide.about + " call me on 9876543210" }).success).toBe(false);
  });
  it("requires the consent box and a known category", () => {
    const r = seekerFormSchema.safeParse({ ...seeker, agree: false, category: "astrology" });
    expect(r.success).toBe(false);
    const paths = r.success ? [] : r.error.issues.map((i) => i.path.join("."));
    expect(paths).toEqual(expect.arrayContaining(["agree", "category"]));
  });
  it("limits guides to the four pilot categories and at least one", () => {
    expect(guideFormSchema.safeParse({ ...guide, categories: [] }).success).toBe(false);
    expect(guideFormSchema.safeParse({ ...guide, categories: ["layoff_unemployment", "career_stagnation", "upskilling_training", "uncertainty"] }).success).toBe(true);
    expect(guideFormSchema.safeParse({ ...guide, categories: ["resume_review"] }).success).toBe(false);
  });
  it("requires a Guide's role title to be a role, not a name or a staff-sounding label", () => {
    const withTitle = (jobTitle: string) => guideFormSchema.safeParse({ ...guide, jobTitle });
    expect(withTitle("Senior HR Manager").success).toBe(true);
    expect(withTitle("My name is Rahul Sharma").success).toBe(false);
    expect(withTitle("Mr. Rahul Sharma").success).toBe(false);
    for (const t of ["Connect Support", "Admin", "Official helper"]) expect(withTitle(t).success, t).toBe(false);
  });
  it("requires shareEmail to be a real yes or no, and accepts either", () => {
    expect(guideFormSchema.safeParse({ ...guide, shareEmail: false }).success).toBe(true);
    const { shareEmail: _omitted, ...without } = guide;
    void _omitted;
    expect(guideFormSchema.safeParse(without).success).toBe(false);
    expect(guideFormSchema.safeParse({ ...guide, shareEmail: "yes" }).success).toBe(false);
  });
  it("rejects a malformed member ID", () => {
    expect(seekerFormSchema.safeParse({ ...seeker, memberId: "!!" }).success).toBe(false);
    expect(seekerFormSchema.safeParse({ ...seeker, memberId: "  " }).success).toBe(false);
  });
});
