import { describe, expect, it } from "vitest";
import { isMatchingChange } from "@/server/profile/derive";

describe("isMatchingChange", () => {
  const base = { category: "career_stagnation", query: "I want to move up.", totalYears: 5, consentedAt: "2026-01-01T00:00:00.000Z" };

  it("ignores consentedAt", () => {
    expect(isMatchingChange(base, { ...base, consentedAt: "2026-02-02T00:00:00.000Z" })).toBe(false);
  });

  it("ignores a leftover alias key from older stored data, in either direction", () => {
    expect(isMatchingChange({ ...base, alias: "Curious Falcon" }, base)).toBe(false);
    expect(isMatchingChange(base, { ...base, alias: "Curious Falcon" })).toBe(false);
    expect(isMatchingChange({ ...base, alias: "Curious Falcon" }, { ...base, alias: "Steady Maple" })).toBe(false);
  });

  it("still notices a real change next to a leftover alias", () => {
    expect(isMatchingChange({ ...base, alias: "Curious Falcon" }, { ...base, totalYears: 6 })).toBe(true);
  });
});
