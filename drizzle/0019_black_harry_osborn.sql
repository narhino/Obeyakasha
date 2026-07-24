ALTER TABLE "user_triggers" DROP CONSTRAINT "user_triggers_acquired_via_track_id_tracks_id_fk";
--> statement-breakpoint
ALTER TABLE "commissions" DROP CONSTRAINT "commissions_delivered_track_id_tracks_id_fk";
--> statement-breakpoint
ALTER TABLE "whispers" DROP CONSTRAINT "whispers_audio_track_id_tracks_id_fk";
--> statement-breakpoint
ALTER TABLE "wish_clusters" DROP CONSTRAINT "wish_clusters_shipped_track_id_tracks_id_fk";
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_triggers" ADD CONSTRAINT "user_triggers_acquired_via_track_id_tracks_id_fk" FOREIGN KEY ("acquired_via_track_id") REFERENCES "public"."tracks"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "commissions" ADD CONSTRAINT "commissions_delivered_track_id_tracks_id_fk" FOREIGN KEY ("delivered_track_id") REFERENCES "public"."tracks"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "whispers" ADD CONSTRAINT "whispers_audio_track_id_tracks_id_fk" FOREIGN KEY ("audio_track_id") REFERENCES "public"."tracks"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wish_clusters" ADD CONSTRAINT "wish_clusters_shipped_track_id_tracks_id_fk" FOREIGN KEY ("shipped_track_id") REFERENCES "public"."tracks"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
