# Blaze — Schema DSL (`@nublestation/blaze`)

`@nublestation/blaze` is the developer-facing schema package for Blaze, NubleStation's database service. A developer writes one typed `schema.ts`, pushes it with the CLI, and immediately gets a real Postgres table with row-level security and a type-safe query client — "as if using their own database and ORM."

ADRs: `docs/adr/003-blaze-database-service.md`, `docs/adr/015-blaze-schema-dsl-and-migration-pipeline.md`  
Implementation plan: `docs/plans/01-blaze-implementation.md`

---

## What the developer writes

```ts
// schema.ts
import { t, defineSchema } from "@nublestation/blaze";

export default defineSchema({
  tasks: t.model({
    title:    t.string().required(),
    status:   t.enum(["todo", "doing", "done"]).default("todo"),
    due_at:   t.timestamp(),
    owner:    t.ref("users"),          // FK to the platform users view
    priority: t.number().index(),      // single-column index
  }).index("status", "due_at"),        // composite index on the model

  tags: t.model({
    label: t.string().required().unique(),
  }),
});
```

`nuble db push` serializes this schema to JSON and uploads it to Blaze, which compiles it server-side into SQL, applies it in a transaction with RLS, and stores the result in `platform.app_tables`.

---

## Package layout

```
packages/blaze/
├── src/
│   ├── types.ts          — SerializedSchema wire types, FieldType, OnDelete
│   ├── builders.ts       — t namespace, FieldBuilder, ModelBuilder, InferRow/InferInsert
│   ├── define-schema.ts  — defineSchema(), Schema<T>, InferSchema<S>
│   ├── reserved.ts       — RESERVED_TABLE_NAMES, assertValidIdentifier
│   ├── serialize.ts      — serializeSchema(), canonicalJson(), canonicalChecksum()
│   ├── errors.ts         — SchemaError
│   ├── index.ts          — re-exports for the "." subpath
│   └── validate.ts       — toZodSchema() for "./validate" subpath
└── test/
    ├── serialize.test.ts
    ├── reserved.test.ts
    ├── define-schema.test.ts
    └── validate.test.ts
```

---

## Subpath exports

| Import | Runtime target | Deps pulled |
|---|---|---|
| `@nublestation/blaze` | Browser + Node | **none** (zero runtime deps) |
| `@nublestation/blaze/validate` | Node / server | `zod` |
| `@nublestation/blaze/compile` | Node / server | `drizzle-orm` (M2, not yet shipped) |

The `.` entry never imports `zod` or `drizzle-orm`, so SDK bundles stay lean regardless of how many fields a schema defines.

---

## The `t` builders

Every field builder returns an immutable descriptor. Chains can be composed in any order.

| Builder | TS value type | Notes |
|---|---|---|
| `t.string()` | `string` | |
| `t.number()` | `number` | integer or float |
| `t.decimal()` | `string` | arbitrary precision; returned as string to avoid float rounding |
| `t.boolean()` | `boolean` | |
| `t.uuid()` | `string` | UUID v4 format |
| `t.timestamp()` | `string` | ISO-8601 string |
| `t.json<T>()` | `T` (default `unknown`) | stored as JSONB |
| `t.enum(["a","b"] as const)` | `"a" \| "b"` | values must be non-empty `readonly` tuple |
| `t.ref("table", {onDelete?})` | `string` | UUID FK; `onDelete` defaults to `"no action"` |

**Modifier chain** (chainable, order-independent, all return new builder):

```ts
t.string()
  .required()       // field has NOT NULL at DB level and is mandatory on insert
  .unique()         // adds UNIQUE constraint
  .index()          // adds a single-column index
  .default(value)   // value type must match field type; "now" is special for timestamp
```

---

## `t.model()` — the table wrapper

```ts
t.model(fields)         // → ModelBuilder carrying the field map
  .index(...cols)       // adds a multi-column (or single-column) index
  .unique(...cols)      // adds a multi-column UNIQUE constraint (not yet enforced in M1)
```

A bare field map `{ tableName: { col: t.string() } }` is also accepted by `defineSchema` and normalized to a `ModelBuilder` internally. Both forms are equivalent; the wrapper is preferred for adding model-level config without future breaking changes.

---

## `defineSchema()`

```ts
import { defineSchema, t } from "@nublestation/blaze";

const schema = defineSchema({ /* table map */ });
```

Validates at call time:

- Table names: lowercase snake_case, max 63 chars, not a SQL keyword, not in `RESERVED_TABLE_NAMES` (`users`, `files`, `notifications`)
- Column names: same rules + not in `RESERVED_COLUMN_NAMES` (`id`, `app_id` — auto-injected by Blaze)
- Enum defaults must be a member of the declared values
- `t.ref("table")` targets must be a defined table or a built-in (`users`)
- `.index("col")` columns must be defined on the same model

Throws `SchemaError` on any violation.

---

## Type inference

```ts
import { type InferSchema } from "@nublestation/blaze";

const schema = defineSchema({
  tasks: t.model({
    title:  t.string().required(),
    status: t.enum(["todo","doing","done"]).default("todo"),
    note:   t.string(),
  }),
});

type DB = InferSchema<typeof schema>;
// DB["tasks"]["Row"]    → { id: string; title: string; status: "todo"|"doing"|"done"; note: string | undefined }
// DB["tasks"]["Insert"] → { title: string; status?: "todo"|"doing"|"done"; note?: string }
// DB["tasks"]["Update"] → Partial<DB["tasks"]["Insert"]>
```

`InferRow<M>` — always includes `id: string` (injected by Blaze); all fields present.  
`InferInsert<M>` — fields with `.required()` and no `.default()` are mandatory; everything else is optional.  
`InferSchema<S>` — record keyed by table name, each entry `{ Row, Insert, Update }`.

---

## Wire format — `SerializedSchema`

```ts
interface SerializedSchema {
  version: 1;
  tables: Record<string, SerializedTable>;
}
interface SerializedTable {
  name: string;
  fields: Record<string, SerializedField>;
  indexes: readonly SerializedIndex[];
}
interface SerializedField {
  type: FieldType;
  required: boolean;
  unique: boolean;
  index: boolean;
  default?: SerializedDefault;   // { kind: "value"; value: ... } | { kind: "now" }
  enumValues?: readonly string[];
  ref?: { table: string; onDelete: OnDelete };
}
```

This JSON — never SQL — is what travels on the wire (per ADR 003 §17). It is stored in `platform.app_tables.schema_json`.

### Canonical form and checksum

```ts
import { serializeSchema, canonicalJson, canonicalChecksum } from "@nublestation/blaze";

const serialized = serializeSchema(schema);
const json       = canonicalJson(serialized);         // recursively key-sorted, array order preserved
const checksum   = await canonicalChecksum(serialized); // sha256 hex via Web Crypto (zero-dep)
```

`canonicalJson` guarantees that two schemas with the same tables and fields — authored with keys in different orders — produce byte-identical JSON and an identical checksum. This is what `platform.migrations.checksum` stores for drift detection.

---

## Validation — `@nublestation/blaze/validate`

Used server-side in Blaze's auto-REST layer (M5) to validate write payloads before they reach the query builder.

```ts
import { toZodSchema } from "@nublestation/blaze/validate";

const insertSchema = toZodSchema(serialized.tables.tasks, "insert");
const updateSchema = toZodSchema(serialized.tables.tasks, "update");

insertSchema.parse(body);  // throws if required fields missing, enum value wrong, unknown key present
updateSchema.parse(body);  // fully partial; still rejects unknown keys
```

Both modes use `.strict()` to reject extra keys not declared in the schema.

---

## Reserved names

| Category | Reserved values |
|---|---|
| Table names | `users`, `files`, `notifications` (built-in tenant_data views) |
| Column names | `id`, `app_id` (auto-injected by Blaze; users cannot declare these) |

Identifier rules (tables and columns): lowercase, start with a letter, only `[a-z0-9_]`, max 63 chars, not a PostgreSQL keyword.

---

## How M1 fits the broader pipeline

```
Developer writes schema.ts
        │  defineSchema() + t builders  ← packages/blaze (this package)
        │
        ▼
serializeSchema() → SerializedSchema JSON
        │  canonicalChecksum()
        │
        ▼  nuble db push (M7)
Blaze service
        │  compileToDrizzle() → drizzle table objects   ← packages/blaze/compile (M2)
        │  drizzle-kit/api → CREATE TABLE SQL
        │  append RLS / trigger / grant SQL
        │  libpg-query allowlist validation (M3)
        │
        ▼  advisory-lock + apply tx
platform.app_tables.schema_json ← stored SerializedSchema
platform.migrations.checksum    ← stored canonicalChecksum
        │
        ▼
Auto-REST /v1/blaze/db/{table}  ← reads app_tables (M5)
Runtime SDK nuble.db.tasks.*    ← fetch client (M6)
Console Database tab            ← reads app_tables + migrations (M8)
```

M1 delivers the schema definition and serialization layer. Every later milestone consumes its types and output without modifications.
