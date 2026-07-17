ALTER TABLE "whispers" ADD COLUMN "pinned" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "whispers" ADD COLUMN "poll_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "whispers" ADD CONSTRAINT "whispers_poll_id_polls_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."polls"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "whispers_pinned_idx" ON "whispers" USING btree ("pinned","published_at");