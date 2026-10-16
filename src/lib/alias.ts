const ADJECTIVES = [
  "Curious", "Steady", "Bright", "Calm", "Bold", "Gentle", "Swift", "Quiet", "Keen", "Warm", "Clever", "Brave",
  "Sunny", "Patient", "Thoughtful", "Nimble", "Honest", "Lively", "Kind", "Focused",
];
const NOUNS = [
  "Falcon", "Maple", "River", "Lantern", "Compass", "Harbor", "Willow", "Summit", "Meadow", "Comet", "Otter",
  "Cedar", "Beacon", "Orchid", "Pebble", "Aurora", "Kestrel", "Juniper", "Anchor", "Sparrow",
];

/** A friendly random alias like "CuriousFalcon42". Uniqueness is enforced by the database. */
export function generateAlias(random: () => number = Math.random): string {
  const pick = <T,>(a: T[]) => a[Math.floor(random() * a.length)]!;
  return `${pick(ADJECTIVES)}${pick(NOUNS)}${Math.floor(random() * 90) + 10}`;
}
