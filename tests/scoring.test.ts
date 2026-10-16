import { describe, expect, it } from "vitest";
import {
  availabilityOverlap, bayesianRating, blend, helpOverlap, normalizeRange, seniorityFit, structuredScore, transitionFit, utcHours,
  type GuideFacts, type SeekerFacts,
} from "@/server/matching/scoring";

const seeker: SeekerFacts = {
  careerStage: "early_career", primaryGoal: "switch_career", helpNeeded: ["career_switch", "interview_prep", "skill_roadmap"],
  targetFunction: "product_management", targetIndustries: ["fintech"], seniority: "entry", similarTransition: false,
  engagementStyle: "few_sessions", mode: "video", availability: ["tue.evening"], timezone: "Asia/Kolkata", preferredFunctions: [], preferredIndustries: [],
};
const guide: GuideFacts = {
  primaryFunctions: ["product_management"], primaryIndustries: ["fintech"], currentFunction: "product_management",
  help: [{ type: "career_switch", level: "expert" }, { type: "interview_prep", level: "solid" }], stagesBestAt: ["early_career"],
  transitions: ["changed_function"], seniority: "director", totalYears: 14, mode: "video", maxNewSeekersPerMonth: 4, availability: ["tue.evening"], timezone: "Asia/Kolkata",
};

describe("helpOverlap", () => {
  it("weights the seeker's top ranks and the guide's level", () => {
    const expert = helpOverlap(["career_switch"], [{ type: "career_switch", level: "expert" }]);
    const some = helpOverlap(["career_switch"], [{ type: "career_switch", level: "some" }]);
    expect(expert).toBe(1);
    expect(some).toBeLessThan(expert);
    const top = helpOverlap(["a", "b", "c"], [{ type: "a", level: "expert" }]);
    const low = helpOverlap(["a", "b", "c"], [{ type: "c", level: "expert" }]);
    expect(top).toBeGreaterThan(low);
    expect(helpOverlap(["x"], [{ type: "y", level: "expert" }])).toBe(0);
  });
});

describe("seniority and transition", () => {
  it("wants the guide above the seeker", () => {
    expect(seniorityFit("entry", "director")).toBe(1);
    expect(seniorityFit("entry", "mid")).toBe(0.8);
    expect(seniorityFit("senior", "senior")).toBe(0.4);
    expect(seniorityFit("director", "entry")).toBe(0);
  });
  it("matches goals to transitions a guide has made", () => {
    expect(transitionFit("switch_career", ["changed_function"])).toBe(1);
    expect(transitionFit("switch_career", ["ic_to_manager"])).toBe(0);
    expect(transitionFit("better_job", [])).toBe(0.5);
  });
});

describe("availability", () => {
  it("is full for identical slots and zero for disjoint ones", () => {
    expect(availabilityOverlap({ availability: ["tue.evening"], timezone: "UTC" }, { availability: ["tue.evening"], timezone: "UTC" })).toBe(1);
    expect(availabilityOverlap({ availability: ["tue.evening"], timezone: "UTC" }, { availability: ["wed.morning"], timezone: "UTC" })).toBe(0);
  });
  it("accounts for timezones", () => {
    // 17:00-21:00 IST is ~11:00-15:00 UTC, which overlaps UTC afternoon but not UTC night.
    const ist = { availability: ["tue.evening"], timezone: "Asia/Kolkata" };
    expect(availabilityOverlap(ist, { availability: ["tue.afternoon"], timezone: "UTC" })).toBeGreaterThan(0);
    expect(availabilityOverlap(ist, { availability: ["tue.night"], timezone: "UTC" })).toBe(0);
  });
  it("wraps across the week boundary", () => {
    const hours = utcHours(["mon.morning"], "Asia/Kolkata");
    expect([...hours].every((h) => h >= 0 && h < 168)).toBe(true);
    expect(hours.size).toBe(6);
  });
});

describe("structuredScore", () => {
  it("is high for a strong fit and low for a poor one", () => {
    const good = structuredScore(seeker, guide).score;
    const poor = structuredScore(seeker, { ...guide, primaryFunctions: ["sales"], primaryIndustries: ["agriculture"], currentFunction: "sales", help: [{ type: "salary_negotiation", level: "some" }], stagesBestAt: ["senior"], transitions: [], seniority: "entry", mode: "text", availability: ["sun.night"] }).score;
    expect(good).toBeGreaterThan(0.8);
    expect(poor).toBeLessThan(0.3);
  });
  it("weighs transition more when the seeker asked for it", () => {
    const g = { ...guide, transitions: [] };
    expect(structuredScore({ ...seeker, similarTransition: true }, g).score).toBeLessThan(structuredScore(seeker, g).score);
  });
});

describe("rating and blending", () => {
  it("new guides sit at the prior; one 5-star review cannot beat an established guide", () => {
    expect(bayesianRating(0, 0)).toBe(3.5);
    expect(bayesianRating(1, 5)).toBeLessThan(bayesianRating(50, 230));
    expect(bayesianRating(50, 230)).toBeGreaterThan(4.3);
  });
  it("normalises ranges and renormalises blend weights", () => {
    expect(normalizeRange([1, 2, 3])).toEqual([0, 0.5, 1]);
    expect(normalizeRange([2, 2])).toEqual([0.5, 0.5]);
    expect(blend({ a: 2, b: 2 }, { a: 1, b: 0 })).toBe(0.5);
  });
});
