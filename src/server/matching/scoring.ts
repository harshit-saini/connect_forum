import { MATCHING } from "@/config/matching";

/** The fields of a Seeker the scorer needs (plain data, so it is testable without a database). */
export type SeekerFacts = {
  category: string;
};

export type GuideFacts = {
  categories: string[];
  totalYears: number;
  maxNewSeekersPerMonth: number;
};

export type StructuredParts = {
  experience: number;
  focus: number;
};

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export function experienceFit(years: number): number {
  return clamp01(years / MATCHING.experienceFullYears);
}

export function focusFit(guideCategoryCount: number): number {
  return guideCategoryCount <= 0 ? 0 : 1 / guideCategoryCount;
}

export function structuredScore(s: SeekerFacts, g: GuideFacts): { score: number; parts: StructuredParts } {
  const parts: StructuredParts = {
    experience: experienceFit(g.totalYears),
    focus: focusFit(g.categories.length),
  };
  const w = MATCHING.structured;
  const keys = Object.keys(parts) as (keyof StructuredParts)[];
  const total = keys.reduce((sum, k) => sum + w[k], 0);
  const score = keys.reduce((sum, k) => sum + w[k] * parts[k], 0) / total;
  return { score: clamp01(score), parts };
}

/** Bayesian average of 1–5 ratings, so a single 5-star review cannot outrank an established Guide. */
export function bayesianRating(count: number, sum: number): number {
  const { priorMean, priorWeight } = MATCHING.rating;
  return (priorMean * priorWeight + sum) / (priorWeight + count);
}

export const ratingScore01 = (count: number, sum: number) => clamp01(bayesianRating(count, sum) / MATCHING.rating.scale);

/** Min-max normalisation across a candidate set; a flat set maps to 0.5. */
export function normalizeRange(values: number[]): number[] {
  const min = Math.min(...values);
  const max = Math.max(...values);
  return values.map((v) => (max - min < 1e-9 ? 0.5 : (v - min) / (max - min)));
}

export function blend(weights: Record<string, number>, values: Record<string, number>): number {
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  return Object.entries(weights).reduce((sum, [k, w]) => sum + w * (values[k] ?? 0), 0) / total;
}
