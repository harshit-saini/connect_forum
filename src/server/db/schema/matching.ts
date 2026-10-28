import { sql } from "drizzle-orm";
import {
  boolean, index, integer, jsonb, pgTable, real, smallint, text, timestamp, uniqueIndex, uuid,
} from "drizzle-orm/pg-core";
import { users } from "./auth";

export const matchRuns = pgTable(
  "match_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seekerId: uuid("seeker_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    /** queued | matching | ranking | done | failed */
    status: text("status").notNull().default("queued"),
    /** Hash of the Seeker's profile_version, guide_pool_version and ratings version at start. */
    inputHash: text("input_hash").notNull(),
    /** true when the LLM rerank produced the final ranking, false for the non-LLM fallback. */
    llmUsed: boolean("llm_used").notNull().default(false),
    /** Budget-limited or LLM-disabled runs are marked here so the UI can say so. */
    degraded: boolean("degraded").notNull().default(false),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    index("match_runs_seeker_idx").on(t.seekerId, t.startedAt),
    index("match_runs_status_idx").on(t.status),
    // One active run per Seeker, enforced by the database so concurrent requests cannot create two.
    uniqueIndex("match_runs_one_active_uq").on(t.seekerId).where(sql`status in ('queued','matching','ranking')`),
  ],
);

export const matches = pgTable(
  "matches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id").notNull().references(() => matchRuns.id, { onDelete: "cascade" }),
    seekerId: uuid("seeker_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    guideId: uuid("guide_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    rank: integer("rank").notNull(),
    score: real("score").notNull(),
    scoreBreakdown: jsonb("score_breakdown").$type<Record<string, unknown>>().notNull().default({}),
    explanation: text("explanation").notNull().default(""),
    /** preliminary (structured + vector) or final (after LLM rerank or fallback). */
    status: text("status").notNull().default("preliminary"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("matches_run_guide_uq").on(t.runId, t.guideId), index("matches_seeker_idx").on(t.seekerId), index("matches_guide_idx").on(t.guideId)],
);

export const connectionRequests = pgTable(
  "connection_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seekerId: uuid("seeker_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    guideId: uuid("guide_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    matchId: uuid("match_id").references(() => matches.id, { onDelete: "set null" }),
    /** approved for every new connection. pending | declined | expired | cancelled only exist on rows from the old approval flow. */
    status: text("status").notNull().default("pending"),
    note: text("note"),
    /** Legacy (approval flow): unused now and null on new rows. */
    tokenHash: text("token_hash"),
    tokenUsedAt: timestamp("token_used_at", { withTimezone: true }),
    /** Legacy (approval flow): unused now and null on new rows. */
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("connection_requests_token_hash_uq").on(t.tokenHash),
    // At most one open (pending or approved) request per Seeker–Guide pair.
    uniqueIndex("connection_requests_open_pair_uq").on(t.seekerId, t.guideId).where(sql`status in ('pending','approved')`),
    index("connection_requests_guide_idx").on(t.guideId, t.status),
    index("connection_requests_seeker_idx").on(t.seekerId, t.status),
  ],
);

/** Grants one Seeker the right to see one Guide's number. Created together with the connection. */
export const unlocks = pgTable(
  "unlocks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seekerId: uuid("seeker_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    guideId: uuid("guide_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    connectionRequestId: uuid("connection_request_id").notNull().references(() => connectionRequests.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("unlocks_pair_uq").on(t.seekerId, t.guideId), uniqueIndex("unlocks_request_uq").on(t.connectionRequestId)],
);

export const ratings = pgTable(
  "ratings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    connectionRequestId: uuid("connection_request_id").notNull().references(() => connectionRequests.id, { onDelete: "cascade" }),
    seekerId: uuid("seeker_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    guideId: uuid("guide_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    score: smallint("score").notNull(),
    review: text("review"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("ratings_request_uq").on(t.connectionRequestId), index("ratings_guide_idx").on(t.guideId)],
);

export const blocks = pgTable(
  "blocks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    blockerId: uuid("blocker_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    blockedId: uuid("blocked_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("blocks_pair_uq").on(t.blockerId, t.blockedId), index("blocks_blocked_idx").on(t.blockedId)],
);

export const reports = pgTable(
  "reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reporterId: uuid("reporter_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    reportedId: uuid("reported_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    reason: text("reason").notNull(),
    details: text("details"),
    /** open | reviewed | dismissed */
    status: text("status").notNull().default("open"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  },
  (t) => [index("reports_reported_idx").on(t.reportedId), index("reports_reporter_idx").on(t.reporterId)],
);

/** Fixed-window counters for rate limiting (key = `${scope}:${subject}`). */
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  count: integer("count").notNull(),
});

export const emailEvents = pgTable(
  "email_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerMessageId: text("provider_message_id"),
    type: text("type").notNull(),
    /** Recipient domain only; the address itself is not stored. */
    recipientDomain: text("recipient_domain"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("email_events_message_idx").on(t.providerMessageId)],
);
