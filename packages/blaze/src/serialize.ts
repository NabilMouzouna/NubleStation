import type { Schema } from "./define-schema.js";
import type { SerializedField, SerializedSchema, SerializedTable } from "./types.js";

/** Build the canonical, serializable form of a schema (the wire/storage shape). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function serializeSchema(schema: Schema<any>): SerializedSchema {
  const tables: Record<string, SerializedTable> = {};
  for (const [name, model] of Object.entries(schema.tables)) {
    const fields: Record<string, SerializedField> = {};
    for (const [column, builder] of Object.entries(model.fields)) {
      fields[column] = { ...builder.state };
    }
    tables[name] = { name, fields, indexes: model.indexes.map((index) => ({ ...index })) };
  }
  return { version: 1, tables };
}

/**
 * Deterministic JSON: object keys are sorted recursively so the output is
 * byte-identical regardless of authoring order. Array order is preserved (so
 * enum values keep their meaning). This is the exact string the checksum covers.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortKeys((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

/**
 * sha256 (hex) of the canonical JSON — the drift guard stored in
 * `platform.migrations.checksum` (ADR 015 §4). Uses Web Crypto so it stays
 * browser-safe and dependency-free (available in Node 20+ and browsers).
 */
export async function canonicalChecksum(schema: SerializedSchema): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(schema));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
