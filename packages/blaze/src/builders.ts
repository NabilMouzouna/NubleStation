import type { FieldType, OnDelete, SerializedField, SerializedIndex } from "./types.js";

/**
 * A single field/column. Chainable; every modifier returns a new builder so a
 * definition reads top-to-bottom. The three type parameters are phantom — they
 * carry the column's TS value type and whether it is required / has a default,
 * so `InferRow` / `InferInsert` can compute precise types for autocomplete.
 */
export class FieldBuilder<
  TValue,
  TRequired extends boolean = false,
  THasDefault extends boolean = false,
> {
  declare readonly _value: TValue;
  declare readonly _required: TRequired;
  declare readonly _hasDefault: THasDefault;

  constructor(readonly state: SerializedField) {}

  /** Mark the column NOT NULL. */
  required(): FieldBuilder<TValue, true, THasDefault> {
    return new FieldBuilder<TValue, true, THasDefault>({ ...this.state, required: true });
  }

  /** Add a UNIQUE constraint on this column. */
  unique(): FieldBuilder<TValue, TRequired, THasDefault> {
    return new FieldBuilder<TValue, TRequired, THasDefault>({ ...this.state, unique: true });
  }

  /** Add a single-column index. */
  index(): FieldBuilder<TValue, TRequired, THasDefault> {
    return new FieldBuilder<TValue, TRequired, THasDefault>({ ...this.state, index: true });
  }

  /**
   * Set a column default. For `t.timestamp()`, `.default("now")` maps to the
   * database `now()` function; for every other field it is a literal value.
   */
  default(value: TValue): FieldBuilder<TValue, TRequired, true> {
    const isNow = this.state.type === "timestamp" && value === "now";
    return new FieldBuilder<TValue, TRequired, true>({
      ...this.state,
      default: isNow ? { kind: "now" } : { kind: "value", value: value as string | number | boolean },
    });
  }
}

function field<T>(type: FieldType, extra: Partial<SerializedField> = {}): FieldBuilder<T> {
  return new FieldBuilder<T>({ type, required: false, unique: false, index: false, ...extra });
}

/** A model's field map. */
export type ModelFields = Record<string, FieldBuilder<unknown, boolean, boolean>>;

/**
 * A table wrapper. Holds the field map plus table-level config (indexes now;
 * `.authorization()`, identifiers, etc. can be added later with no API break).
 */
export class ModelBuilder<F extends ModelFields> {
  declare readonly _fields: F;
  readonly indexes: SerializedIndex[] = [];

  constructor(readonly fields: F) {}

  /** Add a (single or composite) index on existing columns. */
  index(...columns: (keyof F & string)[]): this {
    this.indexes.push({ columns, unique: false });
    return this;
  }

  /** Add a (single or composite) unique constraint on existing columns. */
  unique(...columns: (keyof F & string)[]): this {
    this.indexes.push({ columns, unique: true });
    return this;
  }
}

/** The schema-authoring namespace. */
export const t = {
  string: () => field<string>("string"),
  number: () => field<number>("number"),
  /** Arbitrary-precision; represented as a string to avoid float loss. */
  decimal: () => field<string>("decimal"),
  boolean: () => field<boolean>("boolean"),
  uuid: () => field<string>("uuid"),
  /** ISO-8601 string at the boundary; `.default("now")` ⇒ `now()`. */
  timestamp: () => field<string>("timestamp"),
  json: <T = unknown>() => field<T>("json"),
  enum: <const V extends readonly [string, ...string[]]>(values: V) =>
    field<V[number]>("enum", { enumValues: values }),
  /** Foreign key. `t.ref("users")` resolves to the built-in users (FK + access trigger). */
  ref: (table: string, opts?: { onDelete?: OnDelete }) =>
    field<string>("ref", { ref: { table, onDelete: opts?.onDelete ?? "no action" } }),
  /** Wrap a field map into a table model. */
  model: <F extends ModelFields>(fields: F) => new ModelBuilder<F>(fields),
};

type ValueOf<B> = B extends FieldBuilder<infer V, boolean, boolean> ? V : never;
type RequiredOf<B> = B extends FieldBuilder<unknown, infer R, boolean> ? R : never;
type HasDefaultOf<B> = B extends FieldBuilder<unknown, boolean, infer D> ? D : never;

/** Keys that must be supplied on insert: required AND without a default. */
type RequiredInsertKeys<F extends ModelFields> = {
  [K in keyof F]: RequiredOf<F[K]> extends true
    ? HasDefaultOf<F[K]> extends true
      ? never
      : K
    : never;
}[keyof F];

/** The row shape returned by reads (includes the auto-injected `id`). */
export type InferRow<M> =
  M extends ModelBuilder<infer F> ? { id: string } & { [K in keyof F]: ValueOf<F[K]> } : never;

/** The accepted insert shape (auto columns omitted; defaulted/optional keys optional). */
export type InferInsert<M> =
  M extends ModelBuilder<infer F>
    ? { [K in RequiredInsertKeys<F>]: ValueOf<F[K]> } & {
        [K in Exclude<keyof F, RequiredInsertKeys<F>>]?: ValueOf<F[K]>;
      }
    : never;
