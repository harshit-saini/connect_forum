CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"heartbeat_at" timestamp with time zone,
	"idempotency_key" text,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "profile_embeddings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"profile_version" integer NOT NULL,
	"model" text NOT NULL,
	"dimension" integer NOT NULL,
	"doc_template_version" integer NOT NULL,
	"doc_hash" text NOT NULL,
	"embedding" vector(1536) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profile_embeddings" ADD CONSTRAINT "profile_embeddings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "jobs_claim_idx" ON "jobs" USING btree ("status","run_at");--> statement-breakpoint
CREATE INDEX "jobs_type_status_idx" ON "jobs" USING btree ("type","status");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_idempotency_key_uq" ON "jobs" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "profile_embeddings_user_kind_uq" ON "profile_embeddings" USING btree ("user_id","kind");--> statement-breakpoint
CREATE INDEX "profile_embeddings_hnsw_idx" ON "profile_embeddings" USING hnsw ("embedding" vector_cosine_ops);