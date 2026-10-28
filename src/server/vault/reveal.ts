import "server-only";
import { eq } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { phoneVault } from "@/server/db/schema";
import { openRow } from "./index";

/**
 * The ONLY function that decrypts a phone number for a user-facing response. It performs no
 * authorization itself: callers (the reveal endpoint, milestone 8) must have verified the unlock,
 * suspension state and rate limit first. Never log or cache the return value.
 */
export async function decryptPhoneForReveal(db: Pick<Db, "select">, guideId: string): Promise<string | null> {
  const [row] = await db.select().from(phoneVault).where(eq(phoneVault.guideId, guideId)).limit(1);
  // No consent to send it means no number: legacy rows stay sealed until the Guide saves a number again.
  return row?.emailConsentAt ? openRow(row, guideId) : null;
}
