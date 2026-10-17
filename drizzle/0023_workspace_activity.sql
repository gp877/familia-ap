-- Registro de atividades do espaço de trabalho (aba Registro). Idempotente.
CREATE TABLE IF NOT EXISTS "ws_activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL REFERENCES "household"("id") ON DELETE cascade,
	"owner_id" text NOT NULL,
	"page_id" uuid REFERENCES "ws_page"("id") ON DELETE set null,
	"database_id" uuid,
	"type" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"props" jsonb,
	"via" text DEFAULT 'app' NOT NULL,
	"user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ws_activity_owner_idx" ON "ws_activity" USING btree ("household_id","owner_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ws_activity_page_idx" ON "ws_activity" USING btree ("page_id");
