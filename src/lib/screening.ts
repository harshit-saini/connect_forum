/**
 * Free-text screening shared by client and server. Errors block saving; warnings are advisory.
 * Pure functions, no I/O, so the same rules run in the browser and in server validation.
 */
export const CONTACT_ERROR = "Please remove contact details. Contact details are only shared after approval.";

export type ScreenResult = { errors: string[]; warnings: string[] };

const EMAIL = /[a-z0-9._%+-]+\s*(?:@|\(at\)|\[at\])\s*[a-z0-9-]+(?:\s*(?:\.|\(dot\)|\[dot\])\s*[a-z0-9-]+)*\s*(?:\.|\(dot\)|\[dot\])\s*[a-z]{2,}/i;
const EMAIL_SPELLED = /\b[\w.+-]+\s+at\s+[\w-]+\s+dot\s+(?:com|net|org|in|io|co|edu)\b/i;
const URL_SCHEME = /\b(?:https?:\/\/|www\.)\S+/i;
const DOMAIN = /\b[a-z0-9-]{2,}\.(?:com|org|io|in|co|me|ly|xyz|app|dev|ai|edu|gov|us|uk)(?:\/\S*)?\b/i;
const HANDLE = /(?:^|[\s(])@[a-z0-9_.]{2,}/i;
const MESSENGER = /\b(?:whatsapp|telegram|skype|discord|snapchat|signal)\b/i;
const SOCIAL_ID = /\b(?:linkedin|instagram|insta|twitter|facebook|fb)\b[^.\n]{0,15}(?::|@|\/|\bid\b|\bhandle\b|\bprofile\b)\s*[\w.\-/]{3,}/i;
const PHONE_CANDIDATE = /\+?\d[\d\s().-]{6,}\d/g;

const NAME_INTRO = /\b(?:[Mm]y name is|[Ii] am|[Ii]'m|[Tt]his is|[Cc]all me)\s+[A-Z][a-z]{1,}(?:\s+[A-Z][a-z]{1,})?\b/;
const NAME_TITLE = /\b(?:Mr|Mrs|Ms|Dr|Prof)\.?\s+[A-Z][a-z]{2,}/;
const COMPANY_SUFFIX = /\b[A-Z][\w&]+(?:\s+[A-Z][\w&]+)*\s+(?:Pvt\.?\s+Ltd|Ltd|LLC|Inc|Corp|GmbH|Technologies|Solutions|Systems)\b\.?/;
const CONFIDENTIAL = /\b(?:confidential|nda|proprietary|internal only|trade secret)\b/i;

function looksLikePhone(text: string): boolean {
  for (const m of text.matchAll(PHONE_CANDIDATE)) {
    const raw = m[0];
    const digits = raw.replace(/\D/g, "");
    if (digits.length < 8 || digits.length > 15) continue;
    const groups = raw.split(/\D+/).filter(Boolean);
    // "2018 2019 2020" style year lists are not phone numbers.
    if (groups.length > 1 && groups.every((g) => g.length === 4 && +g >= 1950 && +g <= 2100)) continue;
    // Plain 8–9 digit runs are usually money or ids; formatted/prefixed runs and 10+ digits are flagged.
    const contiguous = groups.length === 1;
    if (contiguous && digits.length < 10 && !raw.startsWith("+")) continue;
    return true;
  }
  return false;
}

export function screenText(input: string | undefined | null): ScreenResult {
  const text = (input ?? "").trim();
  const result: ScreenResult = { errors: [], warnings: [] };
  if (!text) return result;

  if (
    EMAIL.test(text) ||
    EMAIL_SPELLED.test(text) ||
    URL_SCHEME.test(text) ||
    DOMAIN.test(text) ||
    HANDLE.test(text) ||
    MESSENGER.test(text) ||
    SOCIAL_ID.test(text) ||
    looksLikePhone(text)
  ) {
    result.errors.push(CONTACT_ERROR);
  }
  if (NAME_INTRO.test(text) || NAME_TITLE.test(text)) {
    result.warnings.push("This looks like a personal name. Names are never shown. Use your alias instead.");
  }
  if (COMPANY_SUFFIX.test(text)) {
    result.warnings.push("Avoid naming companies. Describe the role or kind of company instead.");
  }
  if (CONFIDENTIAL.test(text)) {
    result.warnings.push("Please don't share confidential company details.");
  }
  return result;
}

/** Lowercase alphanumeric form used to compare company names ("Google LLC" ~ "google"). */
export function normalizeCompany(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(?:pvt|private|ltd|limited|llc|inc|incorporated|corp|corporation|gmbh|plc|co|company|technologies|technology|solutions|systems|india)\b\.?/g, " ")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}
