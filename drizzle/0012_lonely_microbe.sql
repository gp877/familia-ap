CREATE TABLE "ai_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"alma" text,
	"tone" text DEFAULT 'intimo' NOT NULL,
	"response_length" text DEFAULT 'curto' NOT NULL,
	"allow_emoji" boolean DEFAULT false NOT NULL,
	"auto_save_memories" boolean DEFAULT true NOT NULL,
	"calls_user_by_name" boolean DEFAULT true NOT NULL,
	"model_override" text,
	"custom_instructions" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_settings_household_id_unique" UNIQUE("household_id")
);
--> statement-breakpoint
ALTER TABLE "ai_settings" ADD CONSTRAINT "ai_settings_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;