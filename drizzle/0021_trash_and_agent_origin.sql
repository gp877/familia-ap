-- Lixeira do financeiro + origem "feito pela IA". Idempotente (IF NOT EXISTS).
ALTER TABLE "transaction" ADD COLUMN IF NOT EXISTS "created_via" text DEFAULT 'app' NOT NULL;
--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN IF NOT EXISTS "agent_updated_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "upload" ADD COLUMN IF NOT EXISTS "created_via" text DEFAULT 'app' NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "trash_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL REFERENCES "household"("id") ON DELETE cascade,
	"batch_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"data" jsonb NOT NULL,
	"links" jsonb,
	"label" text NOT NULL,
	"reason" text,
	"deleted_via" text DEFAULT 'app' NOT NULL,
	"deleted_by_id" text REFERENCES "user"("id") ON DELETE set null,
	"deleted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trash_item_household_idx" ON "trash_item" USING btree ("household_id","deleted_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trash_item_batch_idx" ON "trash_item" USING btree ("batch_id");
