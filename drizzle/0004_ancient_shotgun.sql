ALTER TABLE "upload" ADD COLUMN "file_hash" text;--> statement-breakpoint
ALTER TABLE "upload" ADD COLUMN "file_size" integer;--> statement-breakpoint
CREATE INDEX "upload_household_hash_idx" ON "upload" USING btree ("household_id","file_hash");