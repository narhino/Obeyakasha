ALTER TABLE "whispers" ADD COLUMN "image_w" integer;--> statement-breakpoint
ALTER TABLE "whispers" ADD COLUMN "image_h" integer;--> statement-breakpoint
ALTER TABLE "whispers" ADD COLUMN "image_fit" text DEFAULT 'natural' NOT NULL;