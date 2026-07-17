ALTER TABLE "users" ADD COLUMN "disguise_mode" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "wishes" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "wishes" ADD COLUMN "reply" text;--> statement-breakpoint
ALTER TABLE "wishes" ADD COLUMN "replied_at" timestamp with time zone;