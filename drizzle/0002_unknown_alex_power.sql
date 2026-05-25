CREATE TYPE "public"."bank_account_type" AS ENUM('checking', 'savings', 'credit_card', 'investment', 'other');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('open', 'scheduled', 'paid');--> statement-breakpoint
CREATE TYPE "public"."pedido_status" AS ENUM('draft', 'sent', 'received', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."sonho_status" AS ENUM('active', 'realized', 'paused');--> statement-breakpoint
CREATE TYPE "public"."viagem_status" AS ENUM('planned', 'in_progress', 'past');--> statement-breakpoint
CREATE TABLE "aniversario" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"created_by_id" text,
	"name" text NOT NULL,
	"month_day" text NOT NULL,
	"birth_year" integer,
	"relation" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" "bank_account_type" DEFAULT 'checking' NOT NULL,
	"institution" text,
	"last_four" text,
	"color" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budget" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"planned_amount" numeric(14, 2) NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "compromisso" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"created_by_id" text,
	"occurred_on" date NOT NULL,
	"time" text,
	"title" text NOT NULL,
	"who" text,
	"location" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fim_de_semana" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"created_by_id" text,
	"weekend_date" date NOT NULL,
	"title" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"bank_account_id" uuid NOT NULL,
	"reference_month" text NOT NULL,
	"due_date" date,
	"closing_date" date,
	"total_amount" numeric(14, 2),
	"minimum_amount" numeric(14, 2),
	"status" "invoice_status" DEFAULT 'open' NOT NULL,
	"paid_by_transaction_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "presente" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"aniversario_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"description" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roteiro" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"viagem_id" uuid NOT NULL,
	"day_number" integer NOT NULL,
	"date" date,
	"day_of_week" text,
	"city" text,
	"distance_km" integer,
	"program_manha" text,
	"program_tarde" text,
	"program_noite" text,
	"estimated_cost" numeric(14, 2),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sonho" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"created_by_id" text,
	"title" text NOT NULL,
	"description" text,
	"image_url" text,
	"status" "sonho_status" DEFAULT 'active' NOT NULL,
	"realized_date" date,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supermercado_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"category" text,
	"unit" text DEFAULT 'un' NOT NULL,
	"default_qty" numeric(10, 2),
	"current_stock" numeric(10, 2),
	"estimated_price" numeric(10, 2),
	"last_bought_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supermercado_pedido_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pedido_id" uuid NOT NULL,
	"item_id" uuid,
	"name_snapshot" text NOT NULL,
	"quantity" numeric(10, 2) NOT NULL,
	"unit" text DEFAULT 'un' NOT NULL,
	"estimated_price" numeric(10, 2),
	"notes" text,
	"is_checked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supermercado_pedido" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"created_by_id" text,
	"title" text,
	"status" "pedido_status" DEFAULT 'draft' NOT NULL,
	"sent_at" timestamp with time zone,
	"received_at" timestamp with time zone,
	"total_estimated" numeric(14, 2),
	"total_actual" numeric(14, 2),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "viagem" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"created_by_id" text,
	"title" text NOT NULL,
	"destination_city" text,
	"destination_country" text,
	"start_date" date,
	"end_date" date,
	"nights" integer,
	"status" "viagem_status" DEFAULT 'planned' NOT NULL,
	"estimated_cost" numeric(14, 2),
	"actual_cost" numeric(14, 2),
	"flight_info" text,
	"tickets_bought" boolean DEFAULT false NOT NULL,
	"cover_image_url" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "bank_account_id" uuid;--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "invoice_id" uuid;--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "installment_current" integer;--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "installment_total" integer;--> statement-breakpoint
ALTER TABLE "upload" ADD COLUMN "bank_account_id" uuid;--> statement-breakpoint
ALTER TABLE "upload" ADD COLUMN "invoice_id" uuid;--> statement-breakpoint
ALTER TABLE "aniversario" ADD CONSTRAINT "aniversario_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aniversario" ADD CONSTRAINT "aniversario_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_account" ADD CONSTRAINT "bank_account_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget" ADD CONSTRAINT "budget_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget" ADD CONSTRAINT "budget_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compromisso" ADD CONSTRAINT "compromisso_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compromisso" ADD CONSTRAINT "compromisso_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fim_de_semana" ADD CONSTRAINT "fim_de_semana_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fim_de_semana" ADD CONSTRAINT "fim_de_semana_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_bank_account_id_bank_account_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presente" ADD CONSTRAINT "presente_aniversario_id_aniversario_id_fk" FOREIGN KEY ("aniversario_id") REFERENCES "public"."aniversario"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roteiro" ADD CONSTRAINT "roteiro_viagem_id_viagem_id_fk" FOREIGN KEY ("viagem_id") REFERENCES "public"."viagem"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sonho" ADD CONSTRAINT "sonho_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sonho" ADD CONSTRAINT "sonho_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supermercado_item" ADD CONSTRAINT "supermercado_item_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supermercado_pedido_item" ADD CONSTRAINT "supermercado_pedido_item_pedido_id_supermercado_pedido_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."supermercado_pedido"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supermercado_pedido_item" ADD CONSTRAINT "supermercado_pedido_item_item_id_supermercado_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."supermercado_item"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supermercado_pedido" ADD CONSTRAINT "supermercado_pedido_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supermercado_pedido" ADD CONSTRAINT "supermercado_pedido_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "viagem" ADD CONSTRAINT "viagem_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "viagem" ADD CONSTRAINT "viagem_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "aniversario_household_idx" ON "aniversario" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "bank_account_household_idx" ON "bank_account" USING btree ("household_id","is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "budget_unique" ON "budget" USING btree ("household_id","category_id","year","month");--> statement-breakpoint
CREATE INDEX "budget_household_year_idx" ON "budget" USING btree ("household_id","year");--> statement-breakpoint
CREATE INDEX "compromisso_household_date_idx" ON "compromisso" USING btree ("household_id","occurred_on");--> statement-breakpoint
CREATE INDEX "fim_de_semana_household_date_idx" ON "fim_de_semana" USING btree ("household_id","weekend_date");--> statement-breakpoint
CREATE INDEX "invoice_household_idx" ON "invoice" USING btree ("household_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_unique_per_card_month" ON "invoice" USING btree ("bank_account_id","reference_month");--> statement-breakpoint
CREATE INDEX "roteiro_viagem_day_idx" ON "roteiro" USING btree ("viagem_id","day_number");--> statement-breakpoint
CREATE INDEX "sonho_household_idx" ON "sonho" USING btree ("household_id","status");--> statement-breakpoint
CREATE INDEX "supermercado_item_household_idx" ON "supermercado_item" USING btree ("household_id","is_active");--> statement-breakpoint
CREATE INDEX "pedido_item_pedido_idx" ON "supermercado_pedido_item" USING btree ("pedido_id");--> statement-breakpoint
CREATE INDEX "supermercado_pedido_household_idx" ON "supermercado_pedido" USING btree ("household_id","status","created_at");--> statement-breakpoint
CREATE INDEX "viagem_household_status_idx" ON "viagem" USING btree ("household_id","status","start_date");--> statement-breakpoint
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_bank_account_id_bank_account_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_invoice_id_invoice_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoice"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload" ADD CONSTRAINT "upload_bank_account_id_bank_account_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload" ADD CONSTRAINT "upload_invoice_id_invoice_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoice"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transaction_household_account_idx" ON "transaction" USING btree ("household_id","bank_account_id");--> statement-breakpoint
CREATE INDEX "transaction_invoice_idx" ON "transaction" USING btree ("invoice_id");