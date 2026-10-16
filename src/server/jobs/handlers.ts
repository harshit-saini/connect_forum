import "server-only";
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { guideProfiles, profileEmbeddings, seekerProfiles } from "@/server/db/schema";
import { env } from "@/server/env";
import { embeddingProvider } from "@/server/ai/embeddings";
import { log } from "@/server/logging/logger";
import { buildNeedsDoc, buildOffersDoc, DOC_TEMPLATE_VERSION } from "@/server/matching/documents";
import type { GuideProfileData, SeekerProfileData } from "@/schemas";
import type { JobRecord, JobType } from "./queue";

type Handler = (job: JobRecord) => Promise<void>;

/** Computes (or refreshes) the vector for one profile. A no-op when the document has not changed. */
export const embedProfile: Handler = async (job) => {
  if (!env().ENABLE_EMBEDDINGS) return;
  const { userId, role } = job.payload as { userId: string; role: "seeker" | "guide" };
  const table = role === "seeker" ? seekerProfiles : guideProfiles;
  const [profile] = await db().select().from(table).where(eq(table.userId, userId)).limit(1);
  if (!profile?.profileCompletedAt || profile.deletedAt) return; // nothing to embed (or deleted since)

  const kind = role === "seeker" ? "needs" : "offers";
  const doc = role === "seeker" ? buildNeedsDoc(profile.data as unknown as SeekerProfileData) : buildOffersDoc(profile.data as unknown as GuideProfileData);
  const docHash = createHash("sha256").update(doc).digest("hex");
  const provider = embeddingProvider();

  const [existing] = await db()
    .select()
    .from(profileEmbeddings)
    .where(and(eq(profileEmbeddings.userId, userId), eq(profileEmbeddings.kind, kind)))
    .limit(1);
  if (existing && existing.docHash === docHash && existing.model === provider.model && existing.docTemplateVersion === DOC_TEMPLATE_VERSION) {
    if (existing.profileVersion !== profile.profileVersion) {
      await db().update(profileEmbeddings).set({ profileVersion: profile.profileVersion }).where(eq(profileEmbeddings.id, existing.id));
    }
    return;
  }

  const [embedding] = await provider.embed([doc]);
  const values = {
    userId,
    kind,
    profileVersion: profile.profileVersion,
    model: provider.model,
    dimension: provider.dimension,
    docTemplateVersion: DOC_TEMPLATE_VERSION,
    docHash,
    embedding: embedding!,
  };
  await db()
    .insert(profileEmbeddings)
    .values(values)
    .onConflictDoUpdate({ target: [profileEmbeddings.userId, profileEmbeddings.kind], set: { ...values, updatedAt: new Date() } });
  log.info("embedding.stored", { userId, kind, model: provider.model });
};

const notYet = (type: string): Handler => async () => {
  throw new Error(`Job handler for ${type} is not implemented yet`);
};

/** Later milestones replace the stubs (match_run: 6, send_email: 6/7, rating_reminder: 9). */
export const handlers: Record<JobType, Handler> = {
  embed_profile: embedProfile,
  match_run: notYet("match_run"),
  send_email: notYet("send_email"),
  rating_reminder: notYet("rating_reminder"),
};
