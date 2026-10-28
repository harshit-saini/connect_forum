ALTER TABLE "connection_requests" ALTER COLUMN "token_hash" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "connection_requests" ALTER COLUMN "expires_at" DROP NOT NULL;