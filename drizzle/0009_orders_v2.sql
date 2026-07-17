CREATE TYPE "public"."proof_mode" AS ENUM('none', 'optional', 'required');--> statement-breakpoint
ALTER TABLE "order_assignments" ADD COLUMN "proof_key" text;--> statement-breakpoint
ALTER TABLE "order_assignments" ADD COLUMN "proof_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "order_assignments" ADD COLUMN "praised_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "proof_mode" "proof_mode" DEFAULT 'none' NOT NULL;