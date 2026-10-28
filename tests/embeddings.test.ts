import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { jobs, profileEmbeddings } from "@/server/db/schema";
import { mockEmbed } from "@/server/ai/embeddings";
import { embedProfile } from "@/server/jobs/handlers";
import { processJobs } from "@/server/jobs/worker";
import { buildNeedsDoc, buildOffersDoc } from "@/server/matching/documents";
import { saveProfile } from "@/server/profile/service";
import type { GuideProfileData, SeekerProfileData } from "@/schemas";
import { guideForm, makeGuide, makeSeeker, seekerForm } from "./fixtures";

const cosine = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i]!, 0);

const data = (form: object, extra: object = {}) => ({ ...form, ...extra, consentedAt: new Date().toISOString() });

describe("embedding documents", () => {
  it("are deterministic and exclude private and identifying data", () => {
    const form = seekerForm({ alias: "SecretAlias99", query: "I want to move from engineering into product management." });
    const doc = buildNeedsDoc(data(form) as unknown as SeekerProfileData);
    expect(doc).toBe(buildNeedsDoc(data(form) as unknown as SeekerProfileData));
    for (const secret of ["SecretAlias99", form.memberId]) expect(doc).not.toContain(secret);
    expect(doc).toContain("Category: Career Stagnation");
    expect(doc).toContain("product management");

    const g = guideForm({ alias: "GuideAlias77" });
    const offers = buildOffersDoc(data(g) as unknown as GuideProfileData);
    for (const secret of ["GuideAlias77", g.memberId, "9876"]) expect(offers).not.toContain(secret);
    expect(offers).toContain("Categories: Career Stagnation, Uncertainty");
  });
});

describe("mock embeddings", () => {
  it("are unit length, deterministic, and closer for related text", () => {
    const a = mockEmbed("I want to switch from engineering into product management");
    const b = mockEmbed("Guide who moved from engineering to product management and mentors career switchers");
    const c = mockEmbed("Pastry chef specialising in sourdough and wedding cakes");
    expect(Math.hypot(...a)).toBeCloseTo(1, 5);
    expect(mockEmbed("same text")).toEqual(mockEmbed("same text"));
    expect(cosine(a, b)).toBeGreaterThan(cosine(a, c));
  });
});

describe("embed_profile", () => {
  beforeEach(async () => {
    await db().delete(jobs);
  });

  it("is queued by registration, embedded by the worker, and skipped when unchanged", async () => {
    const { user: u, form } = await makeSeeker();
    const queued = await db().select().from(jobs);
    expect(queued.some((j) => j.type === "embed_profile" && j.payload.userId === u.id)).toBe(true);

    await processJobs({ maxMs: 20_000 });
    const [row] = await db().select().from(profileEmbeddings).where(eq(profileEmbeddings.userId, u.id));
    expect(row).toMatchObject({ kind: "needs", model: "mock-hash-embedding", dimension: 1536, docTemplateVersion: 3, profileVersion: 1 });
    expect(row!.embedding).toHaveLength(1536);

    // Same document: no new vector, so updatedAt is untouched.
    const job = { id: "x", type: "embed_profile" as const, payload: { userId: u.id, role: "seeker" }, attempts: 1, maxAttempts: 5 };
    await embedProfile(job);
    const [again] = await db().select().from(profileEmbeddings).where(eq(profileEmbeddings.userId, u.id));
    expect(again!.updatedAt.getTime()).toBe(row!.updatedAt.getTime());

    // Changing matching-relevant text queues a job and replaces the vector.
    await saveProfile({ userId: u.id, role: "seeker", values: { ...form, query: form.query + " I also need help with salary negotiation." } });
    await processJobs({ maxMs: 20_000 });
    const [changed] = await db().select().from(profileEmbeddings).where(eq(profileEmbeddings.userId, u.id));
    expect(changed!.docHash).not.toBe(row!.docHash);
    expect(changed!.profileVersion).toBe(2);
  });

  it("embeds Guides as offers", async () => {
    const { user: u } = await makeGuide();
    await processJobs({ maxMs: 20_000 });
    const [row] = await db().select().from(profileEmbeddings).where(eq(profileEmbeddings.userId, u.id));
    expect(row?.kind).toBe("offers");
  });
});
