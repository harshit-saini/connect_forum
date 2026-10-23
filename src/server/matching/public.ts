import { CATEGORIES, LANGUAGES, labelOf } from "@/config/taxonomy";
import type { GuideProfileData, SeekerProfileData } from "@/schemas";

/**
 * What the other side may see (PUB fields). This is the ONLY projection of a profile that is sent to
 * the AI or returned by match and request APIs. Alias, member ID, phone and contact data are never
 * included. The alias is added by callers that render a card, not here.
 */
export type PublicGuide = {
  title: string;
  years: number;
  categories: string[];
  languages: string[];
  about: string;
};

export function publicGuide(d: GuideProfileData): PublicGuide {
  return {
    title: d.jobTitle,
    years: d.totalYears,
    categories: d.categories.map((c) => labelOf(CATEGORIES, c)),
    languages: d.languages.map((l) => labelOf(LANGUAGES, l)),
    about: d.about,
  };
}

export type PublicSeeker = {
  category: string;
  question: string;
  years: number;
  languages: string[];
};

export function publicSeeker(d: SeekerProfileData): PublicSeeker {
  return {
    category: labelOf(CATEGORIES, d.category),
    question: d.query,
    years: d.totalYears,
    languages: d.languages.map((l) => labelOf(LANGUAGES, l)),
  };
}
