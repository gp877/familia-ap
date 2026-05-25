CREATE TYPE "public"."contagem_status" AS ENUM('open', 'closed');--> statement-breakpoint
CREATE TABLE "supermercado_contagem_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contagem_id" uuid NOT NULL,
	"item_id" uuid,
	"name_snapshot" text NOT NULL,
	"location_snapshot" text,
	"unit_snapshot" text DEFAULT 'un' NOT NULL,
	"min_stock_snapshot" numeric(10, 2),
	"counted_qty" numeric(10, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supermercado_contagem" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"created_by_id" text,
	"contagem_date" date NOT NULL,
	"status" "contagem_status" DEFAULT 'open' NOT NULL,
	"notes" text,
	"closed_at" timestamp with time zone,
	"pedido_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "supermercado_item" ADD COLUMN "location" text;--> statement-breakpoint
ALTER TABLE "supermercado_item" ADD COLUMN "brand" text;--> statement-breakpoint
ALTER TABLE "supermercado_item" ADD COLUMN "min_stock" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "supermercado_item" ADD COLUMN "monthly_avg" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "supermercado_contagem_item" ADD CONSTRAINT "supermercado_contagem_item_contagem_id_supermercado_contagem_id_fk" FOREIGN KEY ("contagem_id") REFERENCES "public"."supermercado_contagem"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supermercado_contagem_item" ADD CONSTRAINT "supermercado_contagem_item_item_id_supermercado_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."supermercado_item"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supermercado_contagem" ADD CONSTRAINT "supermercado_contagem_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supermercado_contagem" ADD CONSTRAINT "supermercado_contagem_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "supermercado_contagem_item_contagem_idx" ON "supermercado_contagem_item" USING btree ("contagem_id");--> statement-breakpoint
CREATE INDEX "supermercado_contagem_household_idx" ON "supermercado_contagem" USING btree ("household_id","contagem_date");--> statement-breakpoint
CREATE INDEX "supermercado_item_sort_idx" ON "supermercado_item" USING btree ("household_id","sort_order");