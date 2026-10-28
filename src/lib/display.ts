import { CATEGORIES, labelOf } from "@/config/taxonomy";

/**
 * There are no aliases: the other side is identified by what they have chosen to make public.
 * A Guide appears as their role ("Engineering manager"); a Seeker as "Seeker · <category>".
 * Neither includes a name, member ID, email or phone number.
 */
export function guideDisplayName(data: { jobTitle?: string } | null | undefined): string {
  return data?.jobTitle?.trim() || "Guide";
}

export function seekerDisplayName(data: { category?: string } | null | undefined): string {
  return data?.category ? `Seeker · ${labelOf(CATEGORIES, data.category)}` : "Seeker";
}
