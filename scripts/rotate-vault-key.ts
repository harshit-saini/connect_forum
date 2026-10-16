import "dotenv/config";
import { db } from "@/server/db/client";
import { rotateVault } from "@/server/vault/rotate";

// Run with: pnpm vault:rotate   (see README "Vault key rotation")
rotateVault(db())
  .then((n) => {
    console.log(`rotated ${n} vault row(s)`);
    process.exit(0);
  })
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
