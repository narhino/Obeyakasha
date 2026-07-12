CREATE TABLE IF NOT EXISTS "track_analysis" (
	"track_id" uuid PRIMARY KEY NOT NULL,
	"model" text,
	"summary" text,
	"keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"triggers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"suggested_tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"suggested_description" text,
	"intended_effects" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"safety_notes" text,
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "track_analysis" ADD CONSTRAINT "track_analysis_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
