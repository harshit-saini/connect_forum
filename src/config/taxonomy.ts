/**
 * Option lists for the pilot. Edit labels freely; stored values are stable ids, so renaming a *value*
 * needs a data migration.
 */
export type Option<V extends string = string> = { value: V; label: string; description?: string };

function options<const T extends readonly Option[]>(list: T) {
  return list;
}
export type ValueOf<T extends readonly Option[]> = T[number]["value"];

/** The four pilot categories. A Seeker picks one; a Guide picks every one they can help with. */
export const CATEGORIES = options([
  { value: "layoff_unemployment", label: "Layoff / Unemployment", description: "Lost your job, or between jobs" },
  { value: "career_stagnation", label: "Career Stagnation", description: "Stuck in a role, or not growing" },
  { value: "upskilling_training", label: "Upskilling / Training", description: "Learning new skills, or choosing a course" },
  { value: "uncertainty", label: "Uncertainty", description: "Unsure about the next step or direction" },
] as const);
export type Category = ValueOf<typeof CATEGORIES>;

export const CONTACT_PREFERENCES = options([
  { value: "call", label: "Call" },
  { value: "text", label: "Text message" },
  { value: "either", label: "Either" },
] as const);

export const LANGUAGES = options(
  ["English", "Hindi", "Bengali", "Telugu", "Marathi", "Tamil", "Gujarati", "Kannada", "Malayalam", "Punjabi", "Urdu", "Odia", "Assamese"].map(
    (l) => ({ value: l.toLowerCase(), label: l }),
  ) as Option[] as readonly Option[],
);

export function labelOf(list: readonly Option[], value: string): string {
  return list.find((o) => o.value === value)?.label ?? value;
}
export function valuesOf<T extends readonly Option[]>(list: T) {
  return list.map((o) => o.value) as [ValueOf<T>, ...ValueOf<T>[]];
}
