-- Tabela de passagens aéreas (segmentos de voo) ligada à viagem.
CREATE TABLE "viagem_passagem" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "viagem_id" uuid NOT NULL,
  "segment_order" integer DEFAULT 0 NOT NULL,
  "airline" text,
  "flight_number" text,
  "departure_airport" text,
  "departure_at" timestamp with time zone,
  "arrival_airport" text,
  "arrival_at" timestamp with time zone,
  "cost" numeric(14, 2),
  "passengers" integer,
  "booking_reference" text,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "viagem_passagem_viagem_id_fk" FOREIGN KEY ("viagem_id") REFERENCES "viagem"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX "viagem_passagem_viagem_idx" ON "viagem_passagem" USING btree ("viagem_id", "segment_order");
--> statement-breakpoint
-- Custos discriminados por dia do roteiro (alimentação, hospedagem, passeios, traslados).
ALTER TABLE "roteiro" ADD COLUMN "cost_alimentacao" numeric(14, 2);
--> statement-breakpoint
ALTER TABLE "roteiro" ADD COLUMN "cost_hospedagem" numeric(14, 2);
--> statement-breakpoint
ALTER TABLE "roteiro" ADD COLUMN "cost_passeios" numeric(14, 2);
--> statement-breakpoint
ALTER TABLE "roteiro" ADD COLUMN "cost_traslados" numeric(14, 2);
