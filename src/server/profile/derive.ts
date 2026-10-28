import "server-only";
import type { GuideProfileData, Role, SeekerProfileData } from "@/schemas";

const dedupe = (a: string[]) => [...new Set(a.filter(Boolean))];

/** Columns derived from the answers so hard filters and scores can run in SQL. */
export function deriveSeeker(d: SeekerProfileData) {
  return { category: d.category, totalYears: d.totalYears };
}

export function deriveGuide(d: GuideProfileData) {
  return {
    categories: dedupe(d.categories),
    totalYears: d.totalYears,
  };
}

/** Answers that never affect matching: changing only these leaves profile_version alone. */
const NON_MATCHING = ["alias", "consentedAt"];

function stable(value: unknown): string {
  return JSON.stringify(value, (_k, v) =>
    v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v,
  );
}

/** Returns the answers with non-matching fields removed. */
export function matchingView(data: Record<string, unknown> | undefined): Record<string, unknown> {
  const copy = { ...(data ?? {}) };
  for (const key of NON_MATCHING) delete copy[key];
  return copy;
}

export function isMatchingChange(before: Record<string, unknown> | undefined, after: Record<string, unknown>): boolean {
  return stable(matchingView(before)) !== stable(matchingView(after));
}

export type { Role };
