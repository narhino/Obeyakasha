CREATE TABLE IF NOT EXISTS "subject_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"portrait" text NOT NULL,
	"wants" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"responds_to" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"avoid" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"money" text DEFAULT '' NOT NULL,
	"risk" text DEFAULT '' NOT NULL,
	"openings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"messages_seen" integer DEFAULT 0 NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subject_profiles" ADD CONSTRAINT "subject_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
