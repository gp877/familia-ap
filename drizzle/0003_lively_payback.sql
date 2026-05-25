CREATE TYPE "public"."exam_status" AS ENUM('ok', 'atencao', 'anormal', 'pendente');--> statement-breakpoint
CREATE TABLE "exame" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"created_by_id" text,
	"who" text NOT NULL,
	"name" text NOT NULL,
	"exam_date" date NOT NULL,
	"doctor" text,
	"status" "exam_status" DEFAULT 'ok' NOT NULL,
	"result" text,
	"notes" text,
	"attachment_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pesagem" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"created_by_id" text,
	"who" text NOT NULL,
	"weighed_on" date NOT NULL,
	"weight_kg" numeric(5, 2) NOT NULL,
	"body_fat_pct" numeric(4, 1),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "compromisso" ADD COLUMN "recurring_rule" text;--> statement-breakpoint
ALTER TABLE "compromisso" ADD COLUMN "series_id" uuid;--> statement-breakpoint
ALTER TABLE "exame" ADD CONSTRAINT "exame_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exame" ADD CONSTRAINT "exame_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pesagem" ADD CONSTRAINT "pesagem_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pesagem" ADD CONSTRAINT "pesagem_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exame_household_date_idx" ON "exame" USING btree ("household_id","exam_date");--> statement-breakpoint
CREATE INDEX "pesagem_household_who_date_idx" ON "pesagem" USING btree ("household_id","who","weighed_on");