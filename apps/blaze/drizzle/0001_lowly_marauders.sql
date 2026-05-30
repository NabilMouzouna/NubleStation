CREATE TABLE IF NOT EXISTS "platform"."storage_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_id" uuid NOT NULL,
	"collection" text NOT NULL,
	"filename" text NOT NULL,
	"storage_path" text NOT NULL,
	"mime_type" text,
	"size_bytes" bigint,
	"is_public" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "platform"."vault_settings" (
	"app_id" uuid PRIMARY KEY NOT NULL,
	"allowed_extensions" text[] DEFAULT '{}' NOT NULL,
	"max_file_bytes" bigint DEFAULT 52428800 NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "platform"."storage_files" ADD CONSTRAINT "storage_files_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "platform"."apps"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "platform"."vault_settings" ADD CONSTRAINT "vault_settings_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "platform"."apps"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "storage_files_app_collection_filename_uq" ON "platform"."storage_files" USING btree ("app_id","collection","filename");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "storage_files_app_id_idx" ON "platform"."storage_files" USING btree ("app_id");