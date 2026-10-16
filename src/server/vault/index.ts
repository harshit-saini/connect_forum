import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "@/server/env";

export type Sealed = { ciphertext: Buffer; iv: Buffer; tag: Buffer; keyVersion: number };

/** current key plus retired keys, by version. */
function keyring(): Map<number, Buffer> {
  const e = env();
  const ring = new Map<number, Buffer>([[e.VAULT_KEY_VERSION, Buffer.from(e.VAULT_ENCRYPTION_KEY, "base64")]]);
  for (const entry of e.VAULT_PREVIOUS_KEYS.split(",").map((x) => x.trim()).filter(Boolean)) {
    const [version, key] = entry.split(":");
    ring.set(Number(version), Buffer.from(key!, "base64"));
  }
  return ring;
}

export const currentKeyVersion = () => env().VAULT_KEY_VERSION;

/**
 * AES-256-GCM with a fresh 96-bit IV per value. `aad` (the owning user's id) is authenticated, so a
 * ciphertext copied onto another row fails to decrypt.
 */
export function seal(plaintext: string, aad: string): Sealed {
  const key = keyring().get(currentKeyVersion())!;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(aad));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return { ciphertext, iv, tag: cipher.getAuthTag(), keyVersion: currentKeyVersion() };
}

export function open(sealed: Sealed, aad: string): string {
  const key = keyring().get(sealed.keyVersion);
  if (!key) throw new Error(`Vault key version ${sealed.keyVersion} is not configured`);
  const decipher = createDecipheriv("aes-256-gcm", key, sealed.iv);
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(sealed.tag);
  return Buffer.concat([decipher.update(sealed.ciphertext), decipher.final()]).toString("utf8");
}

type VaultRow = { encryptedNumber: Buffer; iv: Buffer; tag: Buffer; keyVersion: number };

/** Decrypts a `phone_vault` row. */
export function openRow(row: VaultRow, aad: string): string {
  return open({ ciphertext: row.encryptedNumber, iv: row.iv, tag: row.tag, keyVersion: row.keyVersion }, aad);
}

/** Seals a short secret into one string (for places that only hold text, e.g. a job payload). */
export function sealToString(plaintext: string, aad: string): string {
  const s = seal(plaintext, aad);
  return JSON.stringify({ c: s.ciphertext.toString("base64"), i: s.iv.toString("base64"), t: s.tag.toString("base64"), v: s.keyVersion });
}

export function openFromString(sealed: string, aad: string): string {
  const p = JSON.parse(sealed) as { c: string; i: string; t: string; v: number };
  return open({ ciphertext: Buffer.from(p.c, "base64"), iv: Buffer.from(p.i, "base64"), tag: Buffer.from(p.t, "base64"), keyVersion: p.v }, aad);
}
