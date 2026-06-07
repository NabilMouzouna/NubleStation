import {
  boolean,
  doublePrecision,
  index,
  jsonb,
  numeric,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { SerializedField, SerializedSchema } from "./types.js";

const tenantData = pgSchema("tenant_data");

export function compileToDrizzle(schema: SerializedSchema): Record<string, ReturnType<typeof tenantData.table>> {
  const result: Record<string, ReturnType<typeof tenantData.table>> = {};
  for (const [tableName, table] of Object.entries(schema.tables)) {
    const columns: Record<string, any> = {
      id: uuid("id").primaryKey().defaultRandom(),
      app_id: uuid("app_id").notNull(),
    };

    for (const [colName, field] of Object.entries(table.fields)) {
      columns[colName] = applyModifiers(mapType(colName, field), field);
    }

    result[tableName] = tenantData.table(tableName, columns, (t: any) => {
      const idxs: Record<string, any> = {
        appIdIdx: index(`${tableName}_app_id_idx`).on(t.app_id),
      };

      for (const [colName, field] of Object.entries(table.fields)) {
        if (field.index) {
          idxs[`${colName}Idx`] = index(`${tableName}_${colName}_idx`).on(t[colName]);
        }
      }

      for (const [i, idx] of table.indexes.entries()) {
        const cols = idx.columns.map((c: string) => t[c]);
        const builder = idx.unique ? uniqueIndex : index;
        idxs[`compositeIdx_${i}`] = builder(`${tableName}_${idx.columns.join("_")}_idx`).on(...(cols as [any, ...any[]]));
      }

      return idxs;
    });
  }
  return result;
}

function mapType(name: string, field: SerializedField): any {
  switch (field.type) {
    case "string":    return text(name);
    case "number":    return doublePrecision(name);
    case "decimal":   return numeric(name);
    case "boolean":   return boolean(name);
    case "uuid":      return uuid(name);
    case "timestamp": return timestamp(name, { withTimezone: true });
    case "json":      return jsonb(name);
    case "enum":      return text(name);
    case "ref":       return uuid(name);
    default:          throw new Error(`Unknown field type: ${(field as any).type}`);
  }
}

function applyModifiers(col: any, field: SerializedField): any {
  if (field.required) col = col.notNull();
  if (field.unique)   col = col.unique();
  if (field.default) {
    col = field.default.kind === "now" ? col.defaultNow() : col.default(field.default.value);
  }
  return col;
}
