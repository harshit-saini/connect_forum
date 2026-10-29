import "server-only";
import { eq, sql, type SQL } from "drizzle-orm";
import { MATCHING } from "@/config/matching";
import type { GuideProfileData, SeekerProfileData } from "@/schemas";
import { db } from "@/server/db/client";
import { profileEmbeddings, seekerProfiles } from "@/server/db/schema";
import { env } from "@/server/env";
import type { GuideFacts, SeekerFacts } from "./scoring";

export type SeekerContext = {
  userId: string;
  profileVersion: number;
  data: SeekerProfileData;
  facts: SeekerFacts;
  /** Hard-filter inputs (private; never leave the server or reach the AI). */
  filters: { category: string; minGuideYears: number; anyCategory: boolean };
  embedding: number[] | null;
};

export type Candidate = {
  guideId: string;
  data: GuideProfileData;
  facts: GuideFacts;
  /** Cosine similarity to the Seeker's needs vector, or null when either vector is missing. */
  similarity: number | null;
};

const textArray = (items: string[]): SQL => (items.length ? sql`array[${sql.join(items.map((i) => sql`${i}`), sql`, `)}]::text[]` : sql`'{}'::text[]`);

export async function loadSeekerContext(userId: string, useVectors: boolean): Promise<SeekerContext | null> {
  const [p] = await db().select().from(seekerProfiles).where(eq(seekerProfiles.userId, userId)).limit(1);
  if (!p?.profileCompletedAt || !p.memberId || p.deletedAt) return null;
  const data = p.data as unknown as SeekerProfileData;
  let embedding: number[] | null = null;
  if (useVectors) {
    const [e] = await db().select({ v: profileEmbeddings.embedding }).from(profileEmbeddings).where(sql`${profileEmbeddings.userId} = ${userId} and ${profileEmbeddings.kind} = 'needs'`).limit(1);
    embedding = e?.v ?? null;
  }
  return {
    userId,
    profileVersion: p.profileVersion,
    data,
    facts: { category: data.category },
    filters: { category: data.category, minGuideYears: env().MIN_GUIDE_EXPERIENCE_YEARS, anyCategory: env().MATCH_FALLBACK_ANY_CATEGORY },
    embedding,
  };
}

type Row = {
  user_id: string;
  data: GuideProfileData;
  total_years: number;
  categories: string[];
  similarity: number | null;
};

/**
 * Hard filters (HF), all in SQL: verified and active account, registered profile (member ID on file), not
 * paused, experience threshold, the Guide covers the Seeker's category (unless MATCH_FALLBACK_ANY_CATEGORY),
 * no block or report between the pair, and no pending or approved connection for the pair.
 * With vectors, results are ordered by cosine similarity to the Seeker's needs vector.
 */
export async function findCandidates(s: SeekerContext): Promise<Candidate[]> {
  const f = s.filters;
  const vec = s.embedding ? sql`${JSON.stringify(s.embedding)}::vector` : null;
  const simCol = vec ? sql`1 - (e.embedding <=> ${vec})` : sql`null::float8`;
  const order = vec ? sql`e.embedding <=> ${vec} nulls last` : sql`g.total_years desc`;

  const res = await db().execute(sql`
    select g.user_id, g.data, g.total_years, g.categories,
           ${simCol} as similarity
    from guide_profiles g
    join users u on u.id = g.user_id
    left join profile_embeddings e on e.user_id = g.user_id and e.kind = 'offers'
    where g.profile_completed_at is not null and g.member_id is not null and g.deleted_at is null
      and u.suspended_at is null and u.deleted_at is null and u.email_verified
      and g.user_id <> ${s.userId}
      and g.matching_paused = false
      and g.total_years >= ${f.minGuideYears}
      and (${f.anyCategory}::boolean or ${f.category} = any(g.categories))
      and not exists (select 1 from blocks b where (b.blocker_id = ${s.userId} and b.blocked_id = g.user_id) or (b.blocker_id = g.user_id and b.blocked_id = ${s.userId}))
      and not exists (select 1 from reports r where (r.reporter_id = ${s.userId} and r.reported_id = g.user_id) or (r.reporter_id = g.user_id and r.reported_id = ${s.userId}))
      and not exists (select 1 from connection_requests cr where cr.seeker_id = ${s.userId} and cr.guide_id = g.user_id and cr.status in ('pending', 'approved'))
    order by ${order}
    limit ${MATCHING.pipeline.retrievalLimit}`);

  return (res as unknown as { rows: Row[] }).rows.map((r) => ({
    guideId: r.user_id,
    data: r.data,
    similarity: r.similarity === null ? null : Number(r.similarity),
    facts: {
      categories: r.categories,
      totalYears: r.total_years,
    },
  }));
}

/** Rating counts and sums for a set of Guides, for the Bayesian average. */
export async function ratingStats(guideIds: string[]): Promise<Map<string, { count: number; sum: number }>> {
  if (guideIds.length === 0) return new Map();
  const res = await db().execute(sql`select guide_id, count(*)::int as count, coalesce(sum(score), 0)::int as sum from ratings where guide_id = any(${textArray(guideIds)}::uuid[]) group by guide_id`);
  return new Map((res as unknown as { rows: { guide_id: string; count: number; sum: number }[] }).rows.map((r) => [r.guide_id, { count: r.count, sum: r.sum }]));
}
