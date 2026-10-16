import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "@/server/env";

export type Sealed = { ciphertext: Buffer; iv: Buffer; tag: Buffer; keyVersion: number };

const KEY_VERSION = 1;

function key(): Buffer {
  return Buffer.from(env().VAULT_ENCRYPTION_KEY, "base64");
}

/**
 * AES-256-GCM. `aad` (the owning user's id) is authenticated, so a ciphertext copied to another row
 * fails to decrypt.
 */
export function seal(plaintext: string, aad: string): Sealed {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(aad));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return { ciphertext, iv, tag: cipher.getAuthTag(), keyVersion: KEY_VERSION };
}

export function open(sealed: Pick<Sealed, "ciphertext" | "iv" | "tag">, aad: string): string {
  const decipher = createDecipheriv("aes-256-gcm", key(), sealed.iv);
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(sealed.tag);
  return Buffer.concat([decipher.update(sealed.ciphertext), decipher.final()]).toString("utf8");
}
