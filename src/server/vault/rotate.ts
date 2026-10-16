import "server-only";
import { eq, ne } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { phoneVault } from "@/server/db/schema";
import { currentKeyVersion, openRow, seal } from "./index";

/**
 * Re-encrypts every row not already on the current key version. Idempotent and safe to re-run or
 * interrupt: each row is replaced in its own transaction. Returns the number of rows rotated.
 */
export async function rotateVault(db: Db, batchSize = 100): Promise<number> {
  let rotated = 0;
  for (;;) {
    const rows = await db.select().from(phoneVault).where(ne(phoneVault.keyVersion, currentKeyVersion())).limit(batchSize);
    if (rows.length === 0) return rotated;
    for (const row of rows) {
      const plain = openRow(row, row.guideId);
      const fresh = seal(plain, row.guideId);
      await db
        .update(phoneVault)
        .set({ encryptedNumber: fresh.ciphertext, iv: fresh.iv, tag: fresh.tag, keyVersion: fresh.keyVersion, updatedAt: new Date() })
        .where(eq(phoneVault.guideId, row.guideId));
      rotated++;
    }
  }
}
