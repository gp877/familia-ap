CREATE TABLE IF NOT EXISTS "travel_draft" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "household_id" uuid NOT NULL REFERENCES "household"("id") ON DELETE CASCADE,
  "created_by_id" text REFERENCES "user"("id") ON DELETE SET NULL,
  "year" integer NOT NULL,
  "month" integer NOT NULL,
  "title" text NOT NULL,
  "notes" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "travel_draft_unique_per_month"
  ON "travel_draft" ("household_id", "year", "month");
