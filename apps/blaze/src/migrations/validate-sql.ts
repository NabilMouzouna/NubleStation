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

// Minimal structural view of the libpg-query AST — only the nodes we inspect.
interface StmtNode {
  AlterTableStmt?: {
    cmds?: Array<{ AlterTableCmd?: { subtype?: string } }>;
    relation?: { schemaname?: string };
  };
  CreateStmt?: { relation?: { schemaname?: string } };
  [nodeType: string]: unknown;
}

export function validateMigrationSQL(statements: string[]): void {
  for (const sql of statements) {
    let parsed: { stmts?: Array<{ stmt: StmtNode }> };
    try {
      parsed = parseSync(sql) as typeof parsed;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      throw new SchemaError(`SQL parse error: ${message}\nStatement: ${sql}`);
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
          const subtype = cmd.AlterTableCmd?.subtype;
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

function assertTenantDataSchema(nodeType: string, stmt: StmtNode, sql: string): void {
  const rel =
    nodeType === "CreateStmt"
      ? stmt.CreateStmt?.relation
      : stmt.AlterTableStmt?.relation;

  if (!rel) return;

  const schema = rel.schemaname;
  if (schema && schema !== "tenant_data") {
    throw new SchemaError(
      `Migration references disallowed schema "${schema}". Only tenant_data is allowed. Statement: ${sql}`,
    );
  }
}
