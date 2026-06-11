-- Preserva a ORDEM ORIGINAL do PDF pra cada transação. Permite mostrar
-- na tela exatamente como aparece no arquivo, facilitando a conferência.
-- nullable porque tx criadas manualmente (sem upload) não têm ordem de PDF.
ALTER TABLE "transaction" ADD COLUMN "source_order" integer;
--> statement-breakpoint
-- Backfill: pra cada upload existente, define source_order pelo created_at
-- (a ordem de insert preservou a ordem do PDF na época).
UPDATE "transaction" SET "source_order" = sub.rn FROM (
  SELECT id, row_number() OVER (
    PARTITION BY upload_id
    ORDER BY created_at
  ) AS rn
  FROM "transaction"
  WHERE upload_id IS NOT NULL
) sub
WHERE "transaction".id = sub.id AND "transaction".upload_id IS NOT NULL;
