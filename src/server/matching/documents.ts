import "server-only";
import { CATEGORIES, LANGUAGES, labelOf } from "@/config/taxonomy";
import type { GuideProfileData, SeekerProfileData } from "@/schemas";

/**
 * Bump when the document layout changes. It is stored with every vector so old vectors can be
 * found and re-embedded.
 */
export const DOC_TEMPLATE_VERSION = 2;

function lines(entries: Array<[string, string | undefined]>): string {
  return entries
    .filter(([, v]) => v && v.trim())
    .map(([k, v]) => `${k}: ${v!.trim()}`)
    .join("\n");
}

const languages = (values: string[]) => values.map((l) => labelOf(LANGUAGES, l)).join(", ");

/**
 * Deterministic text for a Seeker. Deliberately excludes the alias, member ID and consents. The question
 * is included verbatim (it is screened for contact details on input) and is treated as data by the model.
 */
export function buildNeedsDoc(d: SeekerProfileData): string {
  return lines([
    ["Category", labelOf(CATEGORIES, d.category)],
    ["Question", d.query],
    ["Years of experience", String(d.totalYears)],
    ["Languages", languages(d.languages)],
  ]);
}

/** Deterministic text for a Guide. Excludes alias, member ID, phone and other private fields. */
export function buildOffersDoc(d: GuideProfileData): string {
  return lines([
    ["Categories", d.categories.map((c) => labelOf(CATEGORIES, c)).join(", ")],
    ["Role", d.jobTitle],
    ["About", d.about],
    ["Years of experience", String(d.totalYears)],
    ["Languages", languages(d.languages)],
  ]);
}
