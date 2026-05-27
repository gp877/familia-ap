-- Cardápio passa a ser atemporal: indexado por dia da semana (0=seg..6=dom)
-- em vez de uma data específica. Uma entrada por (household, dayOfWeek).

ALTER TABLE "cardapio" ADD COLUMN "day_of_week" integer;
--> statement-breakpoint
ALTER TABLE "cardapio" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
-- Preenche dayOfWeek a partir do meal_date existente (ISODOW: 1=Mon..7=Sun → 0..6)
UPDATE "cardapio" SET "day_of_week" = (EXTRACT(ISODOW FROM "meal_date")::int - 1) WHERE "meal_date" IS NOT NULL;
--> statement-breakpoint
-- Remove duplicatas que conflitam com o novo UNIQUE (household, dow): mantém a mais recente
DELETE FROM "cardapio" c1 USING "cardapio" c2 WHERE c1.household_id = c2.household_id AND c1.day_of_week = c2.day_of_week AND c1.created_at < c2.created_at;
--> statement-breakpoint
ALTER TABLE "cardapio" ALTER COLUMN "day_of_week" SET NOT NULL;
--> statement-breakpoint
DROP INDEX IF EXISTS "cardapio_household_date_idx";
--> statement-breakpoint
ALTER TABLE "cardapio" DROP COLUMN "meal_date";
--> statement-breakpoint
CREATE UNIQUE INDEX "cardapio_household_dow_unique" ON "cardapio" USING btree ("household_id","day_of_week");
