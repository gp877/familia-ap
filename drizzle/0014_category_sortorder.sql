-- Adiciona sort_order pra suportar drag-and-drop nas categorias.
ALTER TABLE "category" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
-- Inicializa ordem por nome (estável e previsível pro estado atual)
UPDATE "category" SET "sort_order" = sub.rn FROM (
  SELECT id, row_number() OVER (
    PARTITION BY household_id, kind, COALESCE(parent_id::text, '')
    ORDER BY name
  ) AS rn
  FROM "category"
) sub
WHERE "category".id = sub.id;
