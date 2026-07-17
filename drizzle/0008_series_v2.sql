ALTER TABLE "playlists" ADD COLUMN "artwork_key" text;--> statement-breakpoint
ALTER TABLE "playlists" ADD COLUMN "cadence" "program_cadence" DEFAULT 'ongoing' NOT NULL;