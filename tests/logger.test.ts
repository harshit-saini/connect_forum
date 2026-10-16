import { describe, expect, it } from "vitest";
import { redact } from "@/server/logging/logger";

describe("redact", () => {
  it("drops sensitive keys and masks emails/phones in strings", () => {
    const out = redact({ userId: "u1", email: "a@b.com", nested: { phone: "+919876543210", ok: 1 }, msg: "call +91 98765 43210 or a@b.com" }) as Record<string, unknown>;
    expect(out.userId).toBe("u1");
    expect(out.email).toBe("[redacted]");
    expect((out.nested as Record<string, unknown>).phone).toBe("[redacted]");
    expect(out.msg).toBe("call [phone] or [email]");
  });
});
