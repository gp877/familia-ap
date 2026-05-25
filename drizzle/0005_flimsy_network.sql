CREATE TYPE "public"."exame_flag" AS ENUM('low', 'normal', 'high', 'unknown');--> statement-breakpoint
CREATE TABLE "exame_resultado" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exame_id" uuid NOT NULL,
	"household_id" uuid NOT NULL,
	"who" text NOT NULL,
	"exam_date" date NOT NULL,
	"marker" text NOT NULL,
	"marker_label" text NOT NULL,
	"value" numeric(12, 3),
	"value_text" text,
	"unit" text,
	"ref_min" numeric(12, 3),
	"ref_max" numeric(12, 3),
	"ref_text" text,
	"flag" "exame_flag" DEFAULT 'normal' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "exame_resultado" ADD CONSTRAINT "exame_resultado_exame_id_exame_id_fk" FOREIGN KEY ("exame_id") REFERENCES "public"."exame"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exame_resultado" ADD CONSTRAINT "exame_resultado_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exame_resultado_household_idx" ON "exame_resultado" USING btree ("household_id","who","marker","exam_date");--> statement-breakpoint
CREATE INDEX "exame_resultado_exame_idx" ON "exame_resultado" USING btree ("exame_id");