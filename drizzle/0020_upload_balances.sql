-- Saldos do extrato extraídos do PDF (saldo anterior e saldo final).
-- Null pra faturas e pra uploads antigos (re-upload preencheria).
ALTER TABLE "upload" ADD COLUMN "opening_balance" numeric(14, 2);
--> statement-breakpoint
ALTER TABLE "upload" ADD COLUMN "closing_balance" numeric(14, 2);
