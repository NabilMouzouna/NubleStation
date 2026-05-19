CREATE SCHEMA "platform";
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "platform"."api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_id" uuid NOT NULL,
	"key_id" text NOT NULL,
	"secret_hash" text NOT NULL,
	"label" text,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "platform"."app_tables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_id" uuid NOT NULL,
	"table_name" text NOT NULL,
	"schema_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "platform"."apps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"display_name" text NOT NULL,
	"owner_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "platform"."audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"app_id" uuid,
	"action" text NOT NULL,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "platform"."deployments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_id" uuid NOT NULL,
	"version" text NOT NULL,
	"file_path" text NOT NULL,
	"deployed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deployed_by" uuid
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "platform"."migrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_id" uuid NOT NULL,
	"filename" text NOT NULL,
	"checksum" text NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	"applied_by" uuid
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "platform"."organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"subdomain_root" text NOT NULL,
	"admin_email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "platform"."schema_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" text NOT NULL,
	"checksum" text NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "platform"."user_app_access" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"app_id" uuid NOT NULL,
	"role" text DEFAULT 'end_user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "platform"."users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"display_name" text,
	"role" text DEFAULT 'end_user' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "platform"."api_keys" ADD CONSTRAINT "api_keys_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "platform"."apps"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "platform"."app_tables" ADD CONSTRAINT "app_tables_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "platform"."apps"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "platform"."apps" ADD CONSTRAINT "apps_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "platform"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "platform"."audit_log" ADD CONSTRAINT "audit_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "platform"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "platform"."audit_log" ADD CONSTRAINT "audit_log_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "platform"."apps"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "platform"."deployments" ADD CONSTRAINT "deployments_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "platform"."apps"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "platform"."deployments" ADD CONSTRAINT "deployments_deployed_by_users_id_fk" FOREIGN KEY ("deployed_by") REFERENCES "platform"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "platform"."migrations" ADD CONSTRAINT "migrations_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "platform"."apps"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "platform"."migrations" ADD CONSTRAINT "migrations_applied_by_users_id_fk" FOREIGN KEY ("applied_by") REFERENCES "platform"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "platform"."user_app_access" ADD CONSTRAINT "user_app_access_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "platform"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "platform"."user_app_access" ADD CONSTRAINT "user_app_access_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "platform"."apps"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "api_keys_key_id_uq" ON "platform"."api_keys" USING btree ("key_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_keys_app_id_idx" ON "platform"."api_keys" USING btree ("app_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "app_tables_table_name_uq" ON "platform"."app_tables" USING btree ("table_name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "app_tables_app_id_idx" ON "platform"."app_tables" USING btree ("app_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "apps_name_uq" ON "platform"."apps" USING btree ("name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_created_at_idx" ON "platform"."audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deployments_app_id_idx" ON "platform"."deployments" USING btree ("app_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "migrations_app_id_idx" ON "platform"."migrations" USING btree ("app_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "migrations_app_filename_uq" ON "platform"."migrations" USING btree ("app_id","filename");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "schema_version_version_uq" ON "platform"."schema_version" USING btree ("version");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_app_access_user_app_uq" ON "platform"."user_app_access" USING btree ("user_id","app_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_app_access_app_id_idx" ON "platform"."user_app_access" USING btree ("app_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_uq" ON "platform"."users" USING btree ("email");