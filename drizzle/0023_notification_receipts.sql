ALTER TABLE "notification_deliveries" ADD COLUMN "delivered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD COLUMN "opened_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_deliveries_user_idx" ON "notification_deliveries" USING btree ("user_id","created_at");