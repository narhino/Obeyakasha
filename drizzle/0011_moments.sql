CREATE TABLE IF NOT EXISTS "moments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"shown_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "order_assignments" ADD COLUMN "deadline_warned_at" timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "moments" ADD CONSTRAINT "moments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "moments_user_shown_idx" ON "moments" USING btree ("user_id","shown_at");