-- Espaço de trabalho (Tarefas) no modelo do Notion: tudo é página. Idempotente.
CREATE TABLE IF NOT EXISTS "ws_page" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL REFERENCES "household"("id") ON DELETE cascade,
	"owner_id" text NOT NULL REFERENCES "user"("id") ON DELETE cascade,
	"parent_id" uuid REFERENCES "ws_page"("id") ON DELETE cascade,
	"kind" text DEFAULT 'page' NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"icon" text,
	"content" jsonb,
	"props" jsonb,
	"schema" jsonb,
	"views" jsonb,
	"system_key" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"visibility" text DEFAULT 'private' NOT NULL,
	"created_via" text DEFAULT 'app' NOT NULL,
	"agent_updated_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"archived_via" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ws_page_parent_idx" ON "ws_page" USING btree ("household_id","parent_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ws_page_owner_idx" ON "ws_page" USING btree ("household_id","owner_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ws_page_system_key_unique" ON "ws_page" USING btree ("owner_id","system_key") WHERE system_key IS NOT NULL;
