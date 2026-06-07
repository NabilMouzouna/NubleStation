# Blaze — Auto-REST API

Blaze auto-generates CRUD endpoints for every table in an app's schema. No code generation
step — the routes resolve the schema at request time from `platform.app_tables`.

## Endpoints

```
GET    /v1/blaze/db/:table           List rows (paginated)
GET    /v1/blaze/db/:table/:id       Get one row
POST   /v1/blaze/db/:table           Create a row
PATCH  /v1/blaze/db/:table/:id       Update fields
DELETE /v1/blaze/db/:table/:id       Delete a row
```

All endpoints require the Gateway's HMAC signature (`/v1/*` middleware). The resolved
`appId` is used both to scope the schema lookup and as the tenant context for every query.

## Security model

All queries execute inside `withTenant(appId, fn)` which:

1. Opens a transaction.
2. Runs `SET LOCAL ROLE blaze_app` — removes superuser privileges so RLS policies fire.
3. Runs `SELECT set_config('app.current_tenant', $appId, true)` — scopes the RLS predicate.

The RLS policy on every tenant table is:
```sql
USING     (app_id = current_setting('app.current_tenant')::uuid)
WITH CHECK (app_id = current_setting('app.current_tenant')::uuid)
```

This means:
- **SELECT/DELETE** automatically filter to the caller's rows — it is impossible to read
  another tenant's rows.
- **INSERT** must write `app_id = current_tenant`. The query builder always injects
  `app_id = current_setting('app.current_tenant')::uuid` — client bodies may never
  supply `app_id`.
- **UPDATE** cannot move a row to a different tenant (WITH CHECK enforces it).

## Schema resolution

The router reads `platform.app_tables` (never `information_schema`) to resolve an app's
schema. Results are cached in memory with a 30-second TTL per app to avoid a DB round-trip
on every request.

An unknown table name returns 404 before any query is issued.

## Query builder (`src/db/query-builder.ts`)

Pure functions — no DB calls, no side effects. Each takes validated inputs (column names
always come from the schema, never raw user input) and returns `{ sql, params }`.

| Function | SQL emitted |
|---|---|
| `buildSelect(table, limit, offset)` | `SELECT * FROM ... LIMIT $1 OFFSET $2` |
| `buildSelectById(table, id)` | `SELECT * FROM ... WHERE id = $1` |
| `buildInsert(table, columns, values)` | `INSERT INTO ... (app_id, ...) VALUES (current_setting(...)::uuid, ...) RETURNING *` |
| `buildUpdate(table, id, columns, values)` | `UPDATE ... SET ... WHERE id = $N RETURNING *` |
| `buildDelete(table, id)` | `DELETE FROM ... WHERE id = $1 RETURNING *` |

Column and table names are quoted with `"` to prevent SQL injection even if a schema name
contained odd characters (schema validator in M1 prevents this in practice).

## Pagination

Query parameters for `GET /:table`:

| Param | Default | Max |
|---|---|---|
| `limit` | 50 | 200 |
| `offset` | 0 | — |

## Reserved columns

`id` and `app_id` are injected by the platform and are never accepted from client bodies.
Unknown fields in POST/PATCH bodies are silently ignored.

## POST — required fields

A field is required in a POST body when `field.required === true && !field.default`. If a
required field is missing, the route returns 422 before issuing any query.

## File layout

```
apps/blaze/src/
├── db/
│   ├── query-builder.ts    ← pure SQL builders
│   └── schema-cache.ts     ← TTL cache over platform.app_tables
└── routes/
    └── db.ts               ← Hono route handlers
```
