import { SchemaError } from "./errors.js";

/**
 * Resource names reserved org-wide. The built-in `tenant_data` views (ADR 003
 * §4/§7) own these names, so a developer table may not shadow them.
 */
export const RESERVED_TABLE_NAMES: ReadonlySet<string> = new Set([
  "users",
  "files",
  "notifications",
]);

/** Columns Blaze injects automatically; a developer may not define them (ADR 003 §5). */
export const RESERVED_COLUMN_NAMES: ReadonlySet<string> = new Set(["id", "app_id"]);

/** A focused set of SQL reserved words that would be unsafe as bare identifiers. */
const SQL_KEYWORDS: ReadonlySet<string> = new Set([
  "select", "insert", "update", "delete", "from", "where", "table", "index",
  "view", "join", "group", "order", "having", "union", "create", "drop",
  "alter", "grant", "revoke", "user", "primary", "foreign", "references",
  "default", "null", "true", "false", "and", "or", "not", "into", "values",
  "set", "distinct", "limit", "offset", "returning", "with", "column",
]);

/** Postgres identifiers here are lowercase snake_case, start with a letter, ≤ 63 bytes. */
const IDENTIFIER_RE = /^[a-z][a-z0-9_]*$/;
const MAX_IDENTIFIER_LENGTH = 63;

/** Assert a name is a legal Blaze identifier (shared by tables and columns). */
export function assertValidIdentifier(kind: "table" | "column", name: string): void {
  if (!IDENTIFIER_RE.test(name)) {
    throw new SchemaError(
      `Invalid ${kind} name "${name}": use lowercase snake_case starting with a letter (a–z, 0–9, _).`,
    );
  }
  if (name.length > MAX_IDENTIFIER_LENGTH) {
    throw new SchemaError(
      `Invalid ${kind} name "${name}": exceeds ${MAX_IDENTIFIER_LENGTH} characters.`,
    );
  }
  if (SQL_KEYWORDS.has(name)) {
    throw new SchemaError(`Invalid ${kind} name "${name}": it is a reserved SQL keyword.`);
  }
}

/** Validate a table name: a legal identifier that does not shadow a built-in resource. */
export function assertTableNameAllowed(name: string): void {
  assertValidIdentifier("table", name);
  if (RESERVED_TABLE_NAMES.has(name)) {
    throw new SchemaError(
      `Table name "${name}" is reserved by a built-in NubleStation resource. ` +
        `Choose another name (e.g. "clinic_${name}").`,
    );
  }
}

/** Validate a column name: a legal identifier that is not an auto-injected column. */
export function assertColumnNameAllowed(table: string, name: string): void {
  assertValidIdentifier("column", name);
  if (RESERVED_COLUMN_NAMES.has(name)) {
    throw new SchemaError(
      `Column "${name}" in table "${table}" is reserved — Blaze injects it automatically.`,
    );
  }
}
