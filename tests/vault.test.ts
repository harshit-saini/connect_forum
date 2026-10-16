import { randomBytes, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db/client";
import { auditLog, phoneVault } from "@/server/db/schema";
import { audit } from "@/server/audit";
import { parseEnv } from "@/server/env";
import { savePhone } from "@/server/profile/phone";
import { open, openRow, seal } from "@/server/vault";
import { decryptPhoneForReveal } from "@/server/vault/reveal";
import { createUser } from "./fixtures";

const PHONE = "+919876543210";
const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("vault crypto", () => {
  it("round-trips and uses a fresh IV each time", () => {
    const id = randomUUID();
    const a = seal(PHONE, id);
    const b = seal(PHONE, id);
    expect(open(a, id)).toBe(PHONE);
    expect(a.iv.equals(b.iv)).toBe(false);
    expect(a.ciphertext.equals(b.ciphertext)).toBe(false);
    expect(a.ciphertext.toString("utf8")).not.toContain("9876543210");
  });

  it("fails when the ciphertext, tag or owner (AAD) is altered", () => {
    const id = randomUUID();
    const s = seal(PHONE, id);
    expect(() => open(s, randomUUID())).toThrow();
    const flipped = Buffer.from(s.ciphertext);
    flipped[0] = flipped[0]! ^ 1;
    expect(() => open({ ...s, ciphertext: flipped }, id)).toThrow();
    const badTag = Buffer.from(s.tag);
    badTag[0] = badTag[0]! ^ 1;
    expect(() => open({ ...s, tag: badTag }, id)).toThrow();
  });

  it("refuses a key version it does not have", () => {
    const id = randomUUID();
    expect(() => open({ ...seal(PHONE, id), keyVersion: 99 }, id)).toThrow(/not configured/);
  });
});

describe("env validation for key rotation", () => {
  const base = {
    DATABASE_URL: "postgres://u:p@localhost/db",
    APP_URL: "http://localhost:3000",
    AUTH_SECRET: "x".repeat(40),
    CRON_SECRET: "y".repeat(20),
    MOCK_AI: "true",
    VAULT_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
  };
  it("accepts well-formed previous keys and rejects bad ones", () => {
    const good = `1:${randomBytes(32).toString("base64")}`;
    expect(parseEnv({ ...base, VAULT_KEY_VERSION: "2", VAULT_PREVIOUS_KEYS: good } as never).VAULT_KEY_VERSION).toBe(2);
    expect(() => parseEnv({ ...base, VAULT_KEY_VERSION: "2", VAULT_PREVIOUS_KEYS: "1:short" } as never)).toThrow(/VAULT_PREVIOUS_KEYS/);
    expect(() => parseEnv({ ...base, VAULT_KEY_VERSION: "1", VAULT_PREVIOUS_KEYS: good } as never)).toThrow(/VAULT_PREVIOUS_KEYS/);
  });
});

describe("vault persistence and rotation", () => {
  it("stores ciphertext only and decrypts through the reveal helper", async () => {
    const g = await createUser("guide");
    await savePhone(db(), g.id, PHONE);
    const [row] = await db().select().from(phoneVault).where(eq(phoneVault.guideId, g.id));
    expect(Buffer.concat([row!.encryptedNumber, row!.iv, row!.tag]).toString("latin1")).not.toContain("98765");
    expect(openRow(row!, g.id)).toBe(PHONE);
    expect(await decryptPhoneForReveal(db(), g.id)).toBe(PHONE);
    expect(await decryptPhoneForReveal(db(), randomUUID())).toBeNull();
  });

  it("re-encrypts rows from a retired key to the current one", async () => {
    const g = await createUser("guide");
    await savePhone(db(), g.id, PHONE);
    const oldKey = process.env.VAULT_ENCRYPTION_KEY!;
    const [before] = await db().select().from(phoneVault).where(eq(phoneVault.guideId, g.id));
    expect(before!.keyVersion).toBe(1);

    // Rotate: new current key at version 2, old key kept as a retired key.
    const newKey = randomBytes(32).toString("base64");
    process.env.VAULT_ENCRYPTION_KEY = newKey;
    process.env.VAULT_KEY_VERSION = "2";
    process.env.VAULT_PREVIOUS_KEYS = `1:${oldKey}`;
    vi.resetModules();
    // The env module caches its parse, so load fresh copies of the vault modules against the new env.
    const vault = await import("@/server/vault");
    const rot = await import("@/server/vault/rotate");
    const dbm = await import("@/server/db/client");
    const n = await rot.rotateVault(dbm.db());
    expect(n).toBeGreaterThanOrEqual(1);
    const [after] = await dbm.db().select().from(phoneVault).where(eq(phoneVault.guideId, g.id));
    expect(after!.keyVersion).toBe(2);
    expect(vault.openRow(after!, g.id)).toBe(PHONE);
    expect(await rot.rotateVault(dbm.db())).toBe(0); // idempotent
  });
});

describe("audit log", () => {
  it("records actions and strips sensitive metadata", async () => {
    const a = await createUser("seeker");
    const b = await createUser("guide");
    await audit(db(), {
      action: "phone.revealed",
      actorId: a.id,
      targetId: b.id,
      metadata: { connectionId: randomUUID(), phone: PHONE, note: "hello", count: 2 },
    });
    const [row] = await db().select().from(auditLog).where(eq(auditLog.actorId, a.id));
    expect(row!.action).toBe("phone.revealed");
    expect(row!.targetId).toBe(b.id);
    expect(JSON.stringify(row!.metadata)).not.toContain("9876543210");
    expect(row!.metadata).toMatchObject({ phone: "[redacted]", note: "[redacted]", count: 2 });
  });
});
