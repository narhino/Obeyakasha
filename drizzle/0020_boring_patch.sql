ALTER TABLE "commissions" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "commissions" ADD COLUMN "guest_email" text;--> statement-breakpoint
ALTER TABLE "commissions" ADD COLUMN "guest_name" text;