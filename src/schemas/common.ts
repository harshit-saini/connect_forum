import { z } from "zod";
import { type Option, valuesOf } from "@/config/taxonomy";
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

export const years = z.number({ error: "Enter a number" }).int("Whole numbers only").min(0, "Enter a number from 0").max(50, "Enter a number up to 50");

/** Turns "" into undefined (deeply) so blank optional form inputs pass `.optional()`. */
export function normalizeEmpty<T>(value: T): T {
  if (value === "") return undefined as T;
  if (Array.isArray(value)) return value.map(normalizeEmpty) as T;
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, normalizeEmpty(v)])) as T;
  }
  return value;
}
