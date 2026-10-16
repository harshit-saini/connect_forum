import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { jobs, profileEmbeddings } from "@/server/db/schema";
import { mockEmbed } from "@/server/ai/embeddings";
import { embedProfile } from "@/server/jobs/handlers";
import { processJobs } from "@/server/jobs/worker";
import { buildNeedsDoc, buildOffersDoc } from "@/server/matching/documents";
import { saveStep, submitProfile } from "@/server/profile/service";
import type { GuideProfileData, SeekerProfileData } from "@/schemas";
import { createUser, guideSteps, seekerSteps } from "./fixtures";

const cosine = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i]!, 0);

async function completedSeeker(mutate?: (s: ReturnType<typeof seekerSteps>) => void) {
  const u = await createUser("seeker");
  const steps = seekerSteps();
  mutate?.(steps);
  for (const step of ["basics", "background", "goals", "preferences"] as const) {
    expect(await saveStep({ userId: u.id, role: "seeker", step, values: steps[step] })).toEqual({ ok: true });
  }
  await submitProfile({ userId: u.id, role: "seeker" });
  return { u, steps };
}

describe("embedding documents", () => {
  it("are deterministic and exclude private and identifying data", () => {
    const s = seekerSteps("SecretAlias99");
    s.background.excludedCompanies = ["Initech Corp"];
    (s.background as Record<string, unknown>).linkedinUrl = "https://www.linkedin.com/in/someone";
    (s.basics as Record<string, unknown>).city = "Hometown";
    const doc = buildNeedsDoc(s as unknown as SeekerProfileData);
    expect(doc).toBe(buildNeedsDoc(s as unknown as SeekerProfileData));
    for (const secret of ["SecretAlias99", "Initech", "linkedin", "Hometown", "Acme"]) expect(doc).not.toContain(secret);
    expect(doc).toContain("Product manager");
    expect(doc).toContain("1. Career switch planning");

    const g = guideSteps("GuideAlias77");
    const offers = buildOffersDoc(g as unknown as GuideProfileData);
    for (const secret of ["GuideAlias77", "Acme", "Weekday evenings", "9876"]) expect(offers).not.toContain(secret);
    expect(offers).toContain("Career switch planning (expert)");
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

  it("is queued by profile submission, embedded by the worker, and skipped when unchanged", async () => {
    const { u, steps } = await completedSeeker();
    const queued = await db().select().from(jobs);
    expect(queued.some((j) => j.type === "embed_profile" && j.payload.userId === u.id)).toBe(true);

    await processJobs({ maxMs: 20_000 });
    const [row] = await db().select().from(profileEmbeddings).where(eq(profileEmbeddings.userId, u.id));
    expect(row).toMatchObject({ kind: "needs", model: "mock-hash-embedding", dimension: 1536, docTemplateVersion: 1, profileVersion: 1 });
    expect(row!.embedding).toHaveLength(1536);

    // Same document: no new vector, so updatedAt is untouched.
    const job = { id: "x", type: "embed_profile" as const, payload: { userId: u.id, role: "seeker" }, attempts: 1, maxAttempts: 5 };
    await embedProfile(job);
    const [again] = await db().select().from(profileEmbeddings).where(eq(profileEmbeddings.userId, u.id));
    expect(again!.updatedAt.getTime()).toBe(row!.updatedAt.getTime());

    // Changing matching-relevant text queues a job and replaces the vector.
    await saveStep({ userId: u.id, role: "seeker", step: "goals", values: { ...steps.goals, challenge: steps.goals.challenge + " I also need help with salary negotiation." } });
    await processJobs({ maxMs: 20_000 });
    const [changed] = await db().select().from(profileEmbeddings).where(eq(profileEmbeddings.userId, u.id));
    expect(changed!.docHash).not.toBe(row!.docHash);
    expect(changed!.profileVersion).toBe(2);
  });

  it("embeds Guides as offers", async () => {
    const u = await createUser("guide");
    const s = guideSteps();
    for (const step of ["basics", "background", "expertise"] as const) await saveStep({ userId: u.id, role: "guide", step, values: s[step] });
    await saveStep({ userId: u.id, role: "guide", step: "availability", values: s.availability, phone: "+919876543210" });
    await submitProfile({ userId: u.id, role: "guide" });
    await processJobs({ maxMs: 20_000 });
    const [row] = await db().select().from(profileEmbeddings).where(eq(profileEmbeddings.userId, u.id));
    expect(row?.kind).toBe("offers");
  });
});
