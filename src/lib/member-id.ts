/** Member IDs are compared case-insensitively with all whitespace removed. */
export function normalizeMemberId(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, "");
}

export const MEMBER_ID_SHAPE = /^[A-Z0-9][A-Z0-9._/-]{0,38}[A-Z0-9]$/;

/** Parses a comma/semicolon/newline-separated list (an environment variable) into unique normalised IDs. */
export function parseMemberIds(raw: string): string[] {
  return [...new Set(raw.split(/[,;\r\n]+/).map(normalizeMemberId).filter(Boolean))];
}
