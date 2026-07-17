ALTER TABLE "listen_sessions" ADD COLUMN "last_heartbeat_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "whispers" ADD COLUMN "scheduled_for" timestamp with time zone;