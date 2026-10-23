CREATE TABLE "faq_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"category" text NOT NULL,
	"outcome" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "guide_profiles" ADD COLUMN "member_id" text;--> statement-breakpoint
ALTER TABLE "guide_profiles" ADD COLUMN "categories" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "seeker_profiles" ADD COLUMN "member_id" text;--> statement-breakpoint
ALTER TABLE "seeker_profiles" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "faq_events" ADD CONSTRAINT "faq_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "faq_events_created_idx" ON "faq_events" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "guide_profiles_member_id_uq" ON "guide_profiles" USING btree ("member_id");--> statement-breakpoint
CREATE UNIQUE INDEX "seeker_profiles_member_id_uq" ON "seeker_profiles" USING btree ("member_id");