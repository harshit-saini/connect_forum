import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, vector } from "drizzle-orm/pg-core";
import { users } from "./auth";

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    /** queued | running | done | failed (will retry) | dead (gave up) */
    status: text("status").notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }),
    idempotencyKey: text("idempotency_key"),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    index("jobs_claim_idx").on(t.status, t.runAt),
    index("jobs_type_status_idx").on(t.type, t.status),
    uniqueIndex("jobs_idempotency_key_uq").on(t.idempotencyKey),
  ],
);

/** The vector dimension is fixed by the column. Models are asked for this many dimensions. */
export const EMBEDDING_DIMENSIONS = 1536;

export const profileEmbeddings = pgTable(
  "profile_embeddings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** needs = Seeker's needs document, offers = Guide's offers document. */
    kind: text("kind").notNull(),
    profileVersion: integer("profile_version").notNull(),
    model: text("model").notNull(),
    dimension: integer("dimension").notNull(),
    docTemplateVersion: integer("doc_template_version").notNull(),
    /** SHA-256 of the document text; an unchanged hash means no re-embedding is needed. */
    docHash: text("doc_hash").notNull(),
    embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("profile_embeddings_user_kind_uq").on(t.userId, t.kind),
    index("profile_embeddings_hnsw_idx").using("hnsw", t.embedding.op("vector_cosine_ops")),
  ],
);
