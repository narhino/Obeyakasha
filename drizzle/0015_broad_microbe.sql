ALTER TYPE "public"."track_source" ADD VALUE 'subject_upload';--> statement-breakpoint
ALTER TABLE "tracks" ADD COLUMN "size_bytes" integer;--> statement-breakpoint
ALTER TABLE "tracks" ADD COLUMN "owner_user_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tracks" ADD CONSTRAINT "tracks_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tracks_owner_idx" ON "tracks" USING btree ("owner_user_id");