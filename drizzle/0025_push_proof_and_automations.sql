CREATE TABLE IF NOT EXISTS "automations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trigger" "automation_trigger" NOT NULL,
	"label" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"deep_link" text,
	"enabled" boolean DEFAULT false NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"audience" jsonb DEFAULT '{"type":"all"}'::jsonb NOT NULL,
	"respect_quiet_hours" boolean DEFAULT true NOT NULL,
	"last_run_at" timestamp with time zone,
	"last_reached" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "push_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "verify_token" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "automations_trigger_idx" ON "automations" USING btree ("trigger","enabled");