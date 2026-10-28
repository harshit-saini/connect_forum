import "server-only";
import { eq } from "drizzle-orm";
import { parsePhoneNumberFromString } from "libphonenumber-js/min";
import type { Db } from "@/server/db/client";
import { phoneVault } from "@/server/db/schema";
import { E164 } from "@/schemas/profile";
import { seal } from "@/server/vault";

export function isAcceptablePhone(input: string): boolean {
  if (!E164.test(input)) return false;
  const parsed = parsePhoneNumberFromString(input);
  return Boolean(parsed?.isPossible());
}

/** Encrypts and stores a Guide's number, replacing any previous one. Never logs the value. */
export async function savePhone(tx: Pick<Db, "insert">, guideId: string, e164: string) {
  const sealed = seal(e164, guideId);
  const values = {
    guideId,
    encryptedNumber: sealed.ciphertext,
    iv: sealed.iv,
    tag: sealed.tag,
    keyVersion: sealed.keyVersion,
    last4: e164.slice(-4),
    emailConsentAt: new Date(), // saved through the form that says it is emailed to connecting Seekers
  };
  await tx
    .insert(phoneVault)
    .values(values)
    .onConflictDoUpdate({ target: phoneVault.guideId, set: { ...values, updatedAt: new Date() } });
}

/** Removes a Guide's saved number (the vault row). E-mails already sent are out of our hands. */
export async function deletePhone(tx: Pick<Db, "delete">, guideId: string) {
  await tx.delete(phoneVault).where(eq(phoneVault.guideId, guideId));
}

export async function phoneStatus(db: Pick<Db, "select">, guideId: string): Promise<{ has: boolean; last4: string | null }> {
  const [row] = await db.select({ last4: phoneVault.last4, consent: phoneVault.emailConsentAt }).from(phoneVault).where(eq(phoneVault.guideId, guideId));
  // A number without consent (saved under the old promise) counts as "not given": the Guide is asked to re-enter it.
  return row?.consent ? { has: true, last4: row.last4 } : { has: false, last4: null };
}
