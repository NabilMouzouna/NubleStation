import { z, type ZodTypeAny } from "zod";
import type { SerializedField, SerializedTable } from "./types.js";

function fieldToZod(field: SerializedField): ZodTypeAny {
  switch (field.type) {
    case "string":
    case "decimal":
    case "timestamp":
      return z.string();
    case "uuid":
    case "ref":
      return z.string().uuid();
    case "number":
      return z.number();
    case "boolean":
      return z.boolean();
    case "json":
      return z.unknown();
    case "enum":
      return z.enum((field.enumValues ?? []) as [string, ...string[]]);
  }
  // Unreachable: FieldType is a closed union. Guards against a malformed wire payload.
  throw new Error(`Unsupported field type: ${String((field as SerializedField).type)}`);
}

/**
 * Build a Zod validator for a table's write payload. Blaze uses this in the
 * auto-REST validator (M5) to reject malformed writes before any SQL runs.
 *
 * - `insert`: required columns without a default are mandatory; everything else
 *   is optional. Unknown keys are rejected (`.strict()`).
 * - `update`: every column is optional (partial); unknown keys still rejected.
 */
export function toZodSchema(table: SerializedTable, mode: "insert" | "update"): ZodTypeAny {
  const shape: Record<string, ZodTypeAny> = {};
  for (const [column, field] of Object.entries(table.fields)) {
    const base = fieldToZod(field);
    const optional = !field.required || field.default !== undefined;
    shape[column] = optional ? base.optional() : base;
  }
  const object = z.object(shape).strict();
  return mode === "update" ? object.partial() : object;
}
