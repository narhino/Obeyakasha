CREATE TABLE IF NOT EXISTS "whisper_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"whisper_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone,
	"reply_message_id" uuid
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "whisper_loves" (
	"whisper_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "whisper_loves_whisper_id_user_id_pk" PRIMARY KEY("whisper_id","user_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "whisper_comments" ADD CONSTRAINT "whisper_comments_whisper_id_whispers_id_fk" FOREIGN KEY ("whisper_id") REFERENCES "public"."whispers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "whisper_comments" ADD CONSTRAINT "whisper_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "whisper_comments" ADD CONSTRAINT "whisper_comments_reply_message_id_messages_id_fk" FOREIGN KEY ("reply_message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "whisper_loves" ADD CONSTRAINT "whisper_loves_whisper_id_whispers_id_fk" FOREIGN KEY ("whisper_id") REFERENCES "public"."whispers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "whisper_loves" ADD CONSTRAINT "whisper_loves_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "whisper_comments_whisper_idx" ON "whisper_comments" USING btree ("whisper_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "whisper_comments_user_idx" ON "whisper_comments" USING btree ("user_id");