ALTER TABLE "users" ADD COLUMN "oath_petitioned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "oath_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tracks" ADD COLUMN "premiere_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tracks" ADD COLUMN "premiere_announced_at" timestamp with time zone;