ALTER TABLE "messages" ADD COLUMN "push_notification_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "messages" ADD CONSTRAINT "messages_push_notification_id_notifications_id_fk" FOREIGN KEY ("push_notification_id") REFERENCES "public"."notifications"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
