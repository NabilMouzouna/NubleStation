import { loadModule, parseSync } from "libpg-query";
import { SchemaError } from "@nublestation/blaze";

let wasmReady = false;

export async function ensureWasm(): Promise<void> {
  if (!wasmReady) {
    await loadModule();
    wasmReady = true;
  }
}

const ALLOWED_TOP_LEVEL = new Set([
  "CreateStmt",       // CREATE TABLE
  "AlterTableStmt",   // ALTER TABLE (with subtype check)
  "IndexStmt",        // CREATE INDEX / UNIQUE INDEX
  "CreatePolicyStmt", // CREATE POLICY
  "GrantStmt",        // GRANT
]);

// AlterTableCmd subtypes that are allowed (schema migration + RLS setup only)
const ALLOWED_ALTER_SUBTYPES = new Set([
  "AT_AddColumn",
  "AT_AlterColumnType",
  "AT_SetNotNull",
  "AT_DropNotNull",
  "AT_AddConstraint",
  "AT_EnableRowSecurity",
  "AT_DisableRowSecurity",
  "AT_ForceRowSecurity",
  "AT_NoForceRowSecurity",
  "AT_SetRelOptions",
  "AT_ResetRelOptions",
  "AT_ColumnDefault",
  "AT_DropConstraint",
]);

export function validateMigrationSQL(statements: string[]): void {
  for (const sql of statements) {
    let parsed: any;
    try {
      parsed = parseSync(sql);
    } catch (e: any) {
      throw new SchemaError(`SQL parse error: ${e.message}\nStatement: ${sql}`);
    }

    for (const { stmt } of parsed.stmts ?? []) {
      const nodeType = Object.keys(stmt)[0]!;

      if (!ALLOWED_TOP_LEVEL.has(nodeType)) {
        throw new SchemaError(
          `Disallowed SQL statement type "${nodeType}" in migration. Statement: ${sql}`,
        );
      }

      if (nodeType === "AlterTableStmt") {
        for (const cmd of stmt.AlterTableStmt?.cmds ?? []) {
          const subtype = cmd.AlterTableCmd?.subtype as string | undefined;
          if (subtype && !ALLOWED_ALTER_SUBTYPES.has(subtype)) {
            throw new SchemaError(
              `Disallowed ALTER TABLE subtype "${subtype}". Statement: ${sql}`,
            );
          }
        }
      }

      if (nodeType === "CreateStmt" || nodeType === "AlterTableStmt") {
        assertTenantDataSchema(nodeType, stmt, sql);
      }
    }
  }
}

function assertTenantDataSchema(nodeType: string, stmt: any, sql: string): void {
  const rel =
    nodeType === "CreateStmt"
      ? stmt.CreateStmt?.relation
      : stmt.AlterTableStmt?.relation;

  if (!rel) return;

  const schema = rel.schemaname as string | undefined;
  if (schema && schema !== "tenant_data") {
    throw new SchemaError(
      `Migration references disallowed schema "${schema}". Only tenant_data is allowed. Statement: ${sql}`,
    );
  }
}
