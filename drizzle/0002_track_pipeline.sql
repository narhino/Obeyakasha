CREATE TYPE "public"."pipeline_status" AS ENUM('uploaded', 'transcribing', 'organizing', 'ready', 'failed_transcribe', 'failed_organize');--> statement-breakpoint
ALTER TABLE "tracks" ADD COLUMN "pipeline" "pipeline_status" DEFAULT 'uploaded' NOT NULL;--> statement-breakpoint
-- Backfill: every track that predates the pipeline column is already settled.
UPDATE "tracks" SET "pipeline" = 'ready';