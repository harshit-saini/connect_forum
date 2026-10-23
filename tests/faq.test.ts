import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { FAQS } from "@/config/faqs";
import { CATEGORIES } from "@/config/taxonomy";
import { db } from "@/server/db/client";
import { faqEvents } from "@/server/db/schema";
import { faqStats } from "@/server/admin/service";
import { makeGuide, makeSeeker } from "./fixtures";

const viewerRef: { current: { id: string; role: "seeker" | "guide" } | null } = { current: null };
vi.mock("@/server/viewer", () => ({
  requireCompletedProfile: async () => {
    if (!viewerRef.current) throw new Error("NEXT_REDIRECT");
    return viewerRef.current;
  },
}));

describe("FAQ content", () => {
  it("has answers for every pilot category and nothing else", () => {
    expect(Object.keys(FAQS).sort()).toEqual(CATEGORIES.map((c) => c.value).sort());
    for (const list of Object.values(FAQS)) {
      expect(list.length).toBeGreaterThanOrEqual(3);
      for (const f of list) expect(f.q.length && f.a.length).toBeGreaterThan(10);
    }
  });
});

describe("recording FAQ outcomes", () => {
  it("stores the outcome with the category from the saved profile, not from the client", async () => {
    const { recordFaqOutcomeAction } = await import("@/server/actions/faq");
    const { user } = await makeSeeker({ category: "upskilling_training" });
    viewerRef.current = { id: user.id, role: "seeker" };
    expect(await recordFaqOutcomeAction("resolved")).toEqual({ ok: true });
    expect(await recordFaqOutcomeAction("escalated")).toEqual({ ok: true });
    const rows = await db().select().from(faqEvents).where(eq(faqEvents.userId, user.id));
    expect(rows.map((r) => [r.category, r.outcome]).sort()).toEqual([["upskilling_training", "escalated"], ["upskilling_training", "resolved"]]);
    expect((await faqStats()).get("upskilling_training")!.resolved).toBeGreaterThanOrEqual(1);
  });

  it("ignores Guides and unknown outcomes, and requires a signed-in member", async () => {
    const { recordFaqOutcomeAction } = await import("@/server/actions/faq");
    const { user } = await makeGuide();
    viewerRef.current = { id: user.id, role: "guide" };
    expect(await recordFaqOutcomeAction("resolved")).toEqual({ ok: false });
    const seeker = await makeSeeker();
    viewerRef.current = { id: seeker.user.id, role: "seeker" };
    expect(await recordFaqOutcomeAction("hacked" as never)).toEqual({ ok: false });
    viewerRef.current = null;
    await expect(recordFaqOutcomeAction("resolved")).rejects.toThrow("NEXT_REDIRECT");
    expect(await db().select().from(faqEvents).where(eq(faqEvents.userId, user.id))).toHaveLength(0);
  });
});
