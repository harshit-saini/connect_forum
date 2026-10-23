import { describe, expect, it } from "vitest";
import { isKnownMemberId } from "@/server/members";
import { nextGuideMemberId, nextSeekerMemberId } from "./fixtures";

describe("isKnownMemberId", () => {
  it("accepts IDs on the role's list, ignoring case and spaces", () => {
    const g = nextGuideMemberId();
    expect(isKnownMemberId("guide", g)).toBe(true);
    expect(isKnownMemberId("guide", ` ${g.toLowerCase()} `)).toBe(true);
    expect(isKnownMemberId("seeker", nextSeekerMemberId())).toBe(true);
  });
  it("rejects unknown IDs, empty input, and an ID from the other role's list", () => {
    expect(isKnownMemberId("guide", "NOPE-1")).toBe(false);
    expect(isKnownMemberId("guide", "")).toBe(false);
    expect(isKnownMemberId("guide", "   ")).toBe(false);
    expect(isKnownMemberId("guide", nextSeekerMemberId())).toBe(false);
    expect(isKnownMemberId("seeker", nextGuideMemberId())).toBe(false);
  });
});
