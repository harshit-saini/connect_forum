import { z } from "zod";
import { type Option, valuesOf } from "@/config/taxonomy";
import { COUNTRY_CODES } from "@/lib/countries";
import { screenText } from "@/lib/screening";

export const enumOf = <T extends readonly Option[]>(list: T) => z.enum(valuesOf(list));

function screenRefine(value: string, ctx: z.RefinementCtx) {
  const { errors } = screenText(value);
  if (errors.length) ctx.addIssue({ code: "custom", message: errors[0] });
}

/** A trimmed, length-bound free-text string that rejects contact details. */
export function freeText(min: number, max: number) {
  return z
    .string()
    .trim()
    .min(min, min === 1 ? "Required" : `Please write at least ${min} characters`)
    .max(max, `Please keep this under ${max} characters`)
    .superRefine(screenRefine);
}

export const optionalFreeText = (max: number) => freeText(1, max).optional();

export const years = z.number({ error: "Enter a number" }).int("Whole numbers only").min(0).max(50);

export const timezone = z.string().refine((tz) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}, "Choose a valid timezone");

export const country = z.string().refine((c) => COUNTRY_CODES.has(c), "Choose a country");

/** Availability slot: `<day>.<part>`, e.g. "tue.evening". */
export const SLOT = /^(mon|tue|wed|thu|fri|sat|sun)\.(morning|afternoon|evening|night)$/;
export const availability = z
  .array(z.string().regex(SLOT))
  .min(2, "Pick at least 2 time slots")
  .max(28)
  .refine((a) => new Set(a).size === a.length, "Duplicate slots");

/** Turns "" into undefined (deeply) so blank optional form inputs pass `.optional()`. */
export function normalizeEmpty<T>(value: T): T {
  if (value === "") return undefined as T;
  if (Array.isArray(value)) return value.map(normalizeEmpty) as T;
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, normalizeEmpty(v)])) as T;
  }
  return value;
}
