CREATE TABLE "phone_vault" (
	"guide_id" uuid PRIMARY KEY NOT NULL,
	"encrypted_number" "bytea" NOT NULL,
	"iv" "bytea" NOT NULL,
	"tag" "bytea" NOT NULL,
	"key_version" integer DEFAULT 1 NOT NULL,
	"last4" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile_drafts" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"role" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"step_reached" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_aliases" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"alias" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "guide_profiles" ADD COLUMN "data" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "guide_profiles" ADD COLUMN "country" text;--> statement-breakpoint
ALTER TABLE "guide_profiles" ADD COLUMN "timezone" text;--> statement-breakpoint
ALTER TABLE "guide_profiles" ADD COLUMN "languages" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "guide_profiles" ADD COLUMN "total_years" integer;--> statement-breakpoint
ALTER TABLE "guide_profiles" ADD COLUMN "seniority" text;--> statement-breakpoint
ALTER TABLE "guide_profiles" ADD COLUMN "current_industry" text;--> statement-breakpoint
ALTER TABLE "guide_profiles" ADD COLUMN "current_function" text;--> statement-breakpoint
ALTER TABLE "guide_profiles" ADD COLUMN "skills" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "guide_profiles" ADD COLUMN "excluded_companies" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "guide_profiles" ADD COLUMN "availability" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "guide_profiles" ADD COLUMN "mode" text;--> statement-breakpoint
ALTER TABLE "guide_profiles" ADD COLUMN "primary_functions" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "guide_profiles" ADD COLUMN "primary_industries" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "guide_profiles" ADD COLUMN "help_types" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "guide_profiles" ADD COLUMN "stages_best_at" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "guide_profiles" ADD COLUMN "transitions" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "guide_profiles" ADD COLUMN "hiring_experience" text;--> statement-breakpoint
ALTER TABLE "guide_profiles" ADD COLUMN "wont_help_types" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "guide_profiles" ADD COLUMN "max_new_seekers_per_month" integer;--> statement-breakpoint
ALTER TABLE "guide_profiles" ADD COLUMN "session_length" integer;--> statement-breakpoint
ALTER TABLE "guide_profiles" ADD COLUMN "matching_paused" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "seeker_profiles" ADD COLUMN "data" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "seeker_profiles" ADD COLUMN "country" text;--> statement-breakpoint
ALTER TABLE "seeker_profiles" ADD COLUMN "timezone" text;--> statement-breakpoint
ALTER TABLE "seeker_profiles" ADD COLUMN "languages" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "seeker_profiles" ADD COLUMN "total_years" integer;--> statement-breakpoint
ALTER TABLE "seeker_profiles" ADD COLUMN "seniority" text;--> statement-breakpoint
ALTER TABLE "seeker_profiles" ADD COLUMN "current_industry" text;--> statement-breakpoint
ALTER TABLE "seeker_profiles" ADD COLUMN "current_function" text;--> statement-breakpoint
ALTER TABLE "seeker_profiles" ADD COLUMN "skills" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "seeker_profiles" ADD COLUMN "excluded_companies" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "seeker_profiles" ADD COLUMN "availability" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "seeker_profiles" ADD COLUMN "mode" text;--> statement-breakpoint
ALTER TABLE "seeker_profiles" ADD COLUMN "career_stage" text;--> statement-breakpoint
ALTER TABLE "seeker_profiles" ADD COLUMN "primary_goal" text;--> statement-breakpoint
ALTER TABLE "seeker_profiles" ADD COLUMN "target_industries" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "seeker_profiles" ADD COLUMN "target_function" text;--> statement-breakpoint
ALTER TABLE "seeker_profiles" ADD COLUMN "help_needed" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "seeker_profiles" ADD COLUMN "min_guide_experience" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "seeker_profiles" ADD COLUMN "must_share_language" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "seeker_profiles" ADD COLUMN "engagement_style" text;--> statement-breakpoint
ALTER TABLE "phone_vault" ADD CONSTRAINT "phone_vault_guide_id_users_id_fk" FOREIGN KEY ("guide_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_drafts" ADD CONSTRAINT "profile_drafts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_aliases" ADD CONSTRAINT "user_aliases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_aliases_alias_lower_uq" ON "user_aliases" USING btree (lower("alias"));--> statement-breakpoint
CREATE INDEX "guide_profiles_matchable_idx" ON "guide_profiles" USING btree ("matching_paused","total_years");