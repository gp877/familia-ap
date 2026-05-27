CREATE TABLE "cardapio" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"created_by_id" text,
	"meal_date" date NOT NULL,
	"receita_id" uuid,
	"title" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receita" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"created_by_id" text,
	"title" text NOT NULL,
	"description" text,
	"source_url" text,
	"image_url" text,
	"prep_time_min" integer,
	"servings" integer,
	"ingredients" text,
	"steps" text,
	"notes" text,
	"tags" text,
	"is_favorite" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cardapio" ADD CONSTRAINT "cardapio_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cardapio" ADD CONSTRAINT "cardapio_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cardapio" ADD CONSTRAINT "cardapio_receita_id_receita_id_fk" FOREIGN KEY ("receita_id") REFERENCES "public"."receita"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receita" ADD CONSTRAINT "receita_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receita" ADD CONSTRAINT "receita_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cardapio_household_date_idx" ON "cardapio" USING btree ("household_id","meal_date");--> statement-breakpoint
CREATE INDEX "receita_household_idx" ON "receita" USING btree ("household_id","created_at");