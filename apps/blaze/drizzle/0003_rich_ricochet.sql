CREATE TABLE IF NOT EXISTS "platform"."vault_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"grantee_user_id" uuid NOT NULL,
	"collection" text NOT NULL,
	"filename" text,
	"role" text DEFAULT 'viewer' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "platform"."storage_files" ADD COLUMN "owner_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "platform"."vault_grants" ADD CONSTRAINT "vault_grants_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "platform"."apps"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "platform"."vault_grants" ADD CONSTRAINT "vault_grants_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "platform"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "platform"."vault_grants" ADD CONSTRAINT "vault_grants_grantee_user_id_users_id_fk" FOREIGN KEY ("grantee_user_id") REFERENCES "platform"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "vault_grants_unique" ON "platform"."vault_grants" USING btree ("app_id","grantee_user_id","collection","filename");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vault_grants_grantee_idx" ON "platform"."vault_grants" USING btree ("app_id","grantee_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vault_grants_owner_idx" ON "platform"."vault_grants" USING btree ("app_id","owner_id");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "platform"."storage_files" ADD CONSTRAINT "storage_files_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "platform"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "storage_files_owner_id_idx" ON "platform"."storage_files" USING btree ("owner_id");