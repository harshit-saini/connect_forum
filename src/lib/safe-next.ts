/** A post-sign-in target is accepted only if it is a same-site relative path. */
export function safeNext(value: string | null | undefined): string | null {
  if (!value || value.length > 200) return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null;
  return value;
}
