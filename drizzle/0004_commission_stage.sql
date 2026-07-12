CREATE TYPE "public"."commission_stage" AS ENUM('queued', 'script', 'voice', 'editing', 'mastering', 'delivered');--> statement-breakpoint
ALTER TABLE "commissions" ADD COLUMN "stage" "commission_stage" DEFAULT 'queued' NOT NULL;--> statement-breakpoint
ALTER TABLE "commissions" ADD COLUMN "accepted_at" timestamp with time zone;--> statement-breakpoint
-- Backfill: delivered commissions are done; started ones get an approximate clock.
UPDATE "commissions" SET "stage" = 'delivered' WHERE "status" = 'delivered';--> statement-breakpoint
UPDATE "commissions" SET "accepted_at" = "updated_at" WHERE "status" IN ('accepted','in_progress','delivered');