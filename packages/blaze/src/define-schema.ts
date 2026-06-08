import { ModelBuilder, type ModelFields, type InferInsert, type InferRow } from "./builders.js";
import { SchemaError } from "./errors.js";
import {
  assertColumnNameAllowed,
  assertTableNameAllowed,
  RESERVED_TABLE_NAMES,
} from "./reserved.js";
import type { SerializedField } from "./types.js";

/** A table is authored either as a wrapped model or a bare field map. */
export type TableInput = ModelBuilder<ModelFields> | ModelFields;

export type SchemaInput = Record<string, TableInput>;

/** Normalize each table input to a `ModelBuilder` at the type level. */
type NormalizeTables<T extends SchemaInput> = {
  [K in keyof T]: T[K] extends ModelBuilder<ModelFields>
    ? T[K]
    : T[K] extends ModelFields
      ? ModelBuilder<T[K]>
      : never;
};

/** A validated schema: normalized models + a phantom type used by `InferSchema`. */
export class Schema<T extends Record<string, ModelBuilder<ModelFields>>> {
  declare readonly _tables: T;
  constructor(readonly tables: Record<string, ModelBuilder<ModelFields>>) {}
}

/**
 * Per-table `{ Row, Insert, Update }` map — the shape the CLI emits as
 * `<project>/.nuble/types.ts` so `nuble.db.*` queries autocomplete (ADR 015 §9).
 */
export type InferSchema<S> =
  S extends Schema<infer T>
    ? {
        [K in keyof T]: {
          Row: InferRow<T[K]>;
          Insert: InferInsert<T[K]>;
          Update: Partial<InferInsert<T[K]>>;
        };
      }
    : never;

function validateField(table: string, column: string, field: SerializedField): void {
  if (field.type === "enum") {
    if (!field.enumValues || field.enumValues.length === 0) {
      throw new SchemaError(`Enum field "${table}.${column}" must declare at least one value.`);
    }
    if (field.default?.kind === "value" && !field.enumValues.includes(String(field.default.value))) {
      throw new SchemaError(
        `Default "${String(field.default.value)}" for "${table}.${column}" is not one of its enum values.`,
      );
    }
  }
}

/**
 * Define an app's data model. Accepts `t.model({...})` or a bare field map
 * (normalized to a model). Validates names, fields, indexes, and references,
 * then returns a typed `Schema` ready to serialize and push.
 */
export function defineSchema<T extends SchemaInput>(input: T): Schema<NormalizeTables<T>> {
  const tables: Record<string, ModelBuilder<ModelFields>> = {};

  for (const [name, def] of Object.entries(input)) {
    const model = def instanceof ModelBuilder ? def : new ModelBuilder(def);
    assertTableNameAllowed(name);

    if (Object.keys(model.fields).length === 0) {
      throw new SchemaError(`Table "${name}" must declare at least one field.`);
    }
    for (const [column, builder] of Object.entries(model.fields)) {
      assertColumnNameAllowed(name, column);
      validateField(name, column, builder.state);
    }
    for (const index of model.indexes) {
      for (const column of index.columns) {
        if (!(column in model.fields)) {
          throw new SchemaError(`Index on table "${name}" references unknown column "${column}".`);
        }
      }
    }
    tables[name] = model;
  }

  // Resolve references now that every table name is known.
  for (const [name, model] of Object.entries(tables)) {
    for (const [column, builder] of Object.entries(model.fields)) {
      const ref = builder.state.ref;
      if (ref && !RESERVED_TABLE_NAMES.has(ref.table) && !(ref.table in tables)) {
        throw new SchemaError(
          `Field "${name}.${column}" references unknown table "${ref.table}".`,
        );
      }
    }
  }

  return new Schema(tables) as unknown as Schema<NormalizeTables<T>>;
}
