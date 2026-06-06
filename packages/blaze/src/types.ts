/**
 * Wire + descriptor types for the Blaze schema DSL.
 *
 * Everything here is browser-safe and dependency-free. `SerializedSchema` is the
 * canonical JSON that travels on the wire (`nuble db push`) and is stored in
 * `platform.app_tables.schema_json` — never SQL (ADR 003 §6, ADR 015 §1).
 */

/** Supported field kinds. */
export type FieldType =
  | "string"
  | "number"
  | "decimal"
  | "boolean"
  | "uuid"
  | "json"
  | "timestamp"
  | "enum"
  | "ref";

/** Referential action for a `t.ref(...)` foreign key. */
export type OnDelete = "cascade" | "set null" | "restrict" | "no action";

/** A column default, normalized for the wire. */
export type SerializedDefault =
  | { kind: "value"; value: string | number | boolean }
  | { kind: "now" };

/**
 * A single column in the serialized schema. Builders carry this exact shape as
 * their in-memory state, so authoring and wire form never drift.
 */
export interface SerializedField {
  type: FieldType;
  required: boolean;
  unique: boolean;
  index: boolean;
  default?: SerializedDefault;
  /** Present when `type === "enum"`. */
  enumValues?: readonly string[];
  /** Present when `type === "ref"`. */
  ref?: { table: string; onDelete: OnDelete };
}

/** A table-level index (single column or composite). */
export interface SerializedIndex {
  columns: readonly string[];
  unique: boolean;
}

/** One table in the serialized schema. */
export interface SerializedTable {
  name: string;
  fields: Record<string, SerializedField>;
  indexes: readonly SerializedIndex[];
}

/** The canonical, serializable form of a whole schema. */
export interface SerializedSchema {
  version: 1;
  tables: Record<string, SerializedTable>;
}
