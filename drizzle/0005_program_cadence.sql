CREATE TYPE "public"."program_cadence" AS ENUM('ongoing', 'weekly', 'ended');--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "cadence" "program_cadence" DEFAULT 'ongoing' NOT NULL;