import { beforeAll, describe, expect, it } from "vitest";
import { ensureWasm, validateMigrationSQL } from "../../src/migrations/validate-sql.js";

beforeAll(async () => {
  await ensureWasm();
});

describe("validateMigrationSQL", () => {
  it("accepts CREATE TABLE in tenant_data", () => {
    expect(() =>
      validateMigrationSQL([
        `CREATE TABLE "tenant_data"."notes" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "app_id" uuid NOT NULL, "body" text NOT NULL)`,
      ]),
    ).not.toThrow();
  });

  it("accepts ALTER TABLE ADD COLUMN", () => {
    expect(() =>
      validateMigrationSQL([
        `ALTER TABLE "tenant_data"."notes" ADD COLUMN "title" text`,
      ]),
    ).not.toThrow();
  });

  it("accepts CREATE INDEX, CREATE POLICY, and GRANT", () => {
    expect(() =>
      validateMigrationSQL([
        `CREATE INDEX notes_app_id_idx ON "tenant_data"."notes" ("app_id")`,
        `CREATE POLICY tenant_isolation ON "tenant_data"."notes" AS PERMISSIVE FOR ALL USING (app_id = current_setting('app.current_tenant')::uuid)`,
        `GRANT SELECT, INSERT, UPDATE, DELETE ON "tenant_data"."notes" TO blaze_app`,
      ]),
    ).not.toThrow();
  });

  it("rejects DROP DATABASE", () => {
    expect(() => validateMigrationSQL(["DROP DATABASE mydb"])).toThrow(/Disallowed SQL/);
  });

  it("rejects DROP SCHEMA", () => {
    expect(() => validateMigrationSQL(["DROP SCHEMA tenant_data CASCADE"])).toThrow(/Disallowed SQL/);
  });

  it("rejects ALTER TABLE DROP COLUMN", () => {
    expect(() =>
      validateMigrationSQL([`ALTER TABLE "tenant_data"."notes" DROP COLUMN body`]),
    ).toThrow(/Disallowed ALTER TABLE subtype/);
  });

  it("rejects a CREATE TABLE referencing a non-tenant_data schema", () => {
    expect(() =>
      validateMigrationSQL([
        `CREATE TABLE "platform"."evil" ("id" uuid PRIMARY KEY)`,
      ]),
    ).toThrow(/disallowed schema/);
  });
});
