import { describe, expect, it } from "vitest";
import {
  bayesianRating, blend, experienceFit, focusFit, languageFit, normalizeRange, structuredScore,
  type GuideFacts, type SeekerFacts,
} from "@/server/matching/scoring";

const seeker: SeekerFacts = { category: "career_stagnation", languages: ["english", "hindi"] };
const guide: GuideFacts = { categories: ["career_stagnation"], languages: ["english", "hindi"], totalYears: 15, maxNewSeekersPerMonth: 4 };

describe("language, experience and focus", () => {
  it("counts the share of the seeker's languages the guide speaks", () => {
    expect(languageFit(["english", "hindi"], ["english", "hindi", "tamil"])).toBe(1);
    expect(languageFit(["english", "hindi"], ["english"])).toBe(0.5);
    expect(languageFit(["english"], ["tamil"])).toBe(0);
    expect(languageFit([], ["english"])).toBe(0);
  });
  it("rewards experience up to a ceiling", () => {
    expect(experienceFit(0)).toBe(0);
    expect(experienceFit(7.5)).toBe(0.5);
    expect(experienceFit(15)).toBe(1);
    expect(experienceFit(40)).toBe(1);
  });
  it("prefers a guide with fewer categories", () => {
    expect(focusFit(1)).toBe(1);
    expect(focusFit(2)).toBe(0.5);
    expect(focusFit(4)).toBe(0.25);
    expect(focusFit(0)).toBe(0);
  });
});

describe("structuredScore", () => {
  it("is high for a strong fit and low for a poor one", () => {
    const good = structuredScore(seeker, guide).score;
    const poor = structuredScore(seeker, { ...guide, categories: ["a", "b", "c", "d"], languages: ["tamil"], totalYears: 3 }).score;
    expect(good).toBe(1);
    expect(poor).toBeLessThan(0.2);
    expect(structuredScore(seeker, { ...guide, totalYears: 8 }).score).toBeLessThan(good);
  });
  it("exposes its parts for the score breakdown", () => {
    expect(structuredScore(seeker, guide).parts).toEqual({ language: 1, experience: 1, focus: 1 });
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
