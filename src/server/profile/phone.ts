import "server-only";
import { eq } from "drizzle-orm";
import { parsePhoneNumberFromString } from "libphonenumber-js/min";
import type { Db } from "@/server/db/client";
import { phoneVault } from "@/server/db/schema";
import { E164 } from "@/schemas/guide";
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
  };
  await tx
    .insert(phoneVault)
    .values(values)
    .onConflictDoUpdate({ target: phoneVault.guideId, set: { ...values, updatedAt: new Date() } });
}

export async function phoneStatus(db: Pick<Db, "select">, guideId: string): Promise<{ has: boolean; last4: string | null }> {
  const [row] = await db.select({ last4: phoneVault.last4 }).from(phoneVault).where(eq(phoneVault.guideId, guideId));
  return { has: Boolean(row), last4: row?.last4 ?? null };
}
