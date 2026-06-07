# Blaze — Migration Apply Pipeline

This document covers the `applyMigration` function and the admin HTTP route that exposes
it. Together they form the server-side half of `nuble db push` (M7 CLI will call this
endpoint).

## Overview

```
Developer CLI                    Blaze Service
─────────────                    ─────────────
nuble db push
  → compile schema
  → POST /v1/blaze/admin/apps/:appId/migrations   ← SerializedSchema JSON
                                 ├── verify callerAppId == routeAppId
                                 ├── applyMigration(appId, schema)
                                 │     ├── ensureWasm()
                                 │     ├── canonicalChecksum(schema)
                                 │     ├── BEGIN TRANSACTION
                                 │     ├── pg_advisory_xact_lock('migrations:<appId>')
                                 │     ├── read prev schema + last checksum
                                 │     ├── early-exit if checksum matches (no-op)
                                 │     ├── generateMigrationSQL(prev, cur)
                                 │     ├── validateMigrationSQL(sql)    ← allowlist gate
                                 │     ├── bootstrap blaze_app + tenant_data schema
                                 │     ├── execute each SQL statement
                                 │     ├── upsert platform.app_tables
                                 │     ├── insert platform.migrations
                                 │     └── COMMIT
                                 └── { status, statementsApplied }
```

## Route

```
POST /v1/blaze/admin/apps/:appId/migrations
```

**Auth:** Gateway HMAC — same chain as all `/v1/*` endpoints. The Gateway resolves the
developer's API key to an `app_id` and injects `X-Nuble-App-Id` in a signed header. The
route rejects any request where `:appId` ≠ `c.var.appId` (prevents cross-app pushes).

**Request body:** A `SerializedSchema` JSON object — the wire format produced by
`serializeSchema()` in `@nublestation/blaze`.

**Responses:**

| Status | Body | Meaning |
|--------|------|---------|
| 200 | `{ status: "applied", statementsApplied: N }` | Migration ran successfully |
| 200 | `{ status: "no-op", message: "Schema unchanged" }` | Checksum matches last run |
| 400 | `{ error: "Invalid JSON body" }` | Body is not valid JSON |
| 403 | `{ error: "Forbidden" }` | `:appId` ≠ caller's appId |
| 422 | `{ error: "..." }` | Bad schema shape or SQL allowlist violation |

## `applyMigration(appId, curSchema)`

**File:** `apps/blaze/src/migrations/apply.ts`

### Advisory lock

`pg_advisory_xact_lock(hashtext('migrations:<appId>'))` is taken inside the transaction
immediately after `BEGIN`. This serializes concurrent pushes from the same app (e.g., two
CI jobs running `nuble db push` simultaneously). The lock is automatically released on
`COMMIT` or `ROLLBACK`.

### Checksum de-duplication

`canonicalChecksum(schema)` (from `@nublestation/blaze`) produces a deterministic SHA-256
hex of the normalized schema JSON. If the last entry in `platform.migrations` for this app
carries the same checksum, the function returns `{ noOp: true }` without touching the DB.

### Bootstrap (idempotent)

Before executing any DDL, `applyMigration` ensures:

1. `blaze_app` NOLOGIN role exists (created inline with `DO $$ ... $$` if missing).
2. `tenant_data` schema exists (`CREATE SCHEMA IF NOT EXISTS`).
3. `blaze_app` has `USAGE ON SCHEMA tenant_data`.

These three steps run on every push but are cheap no-ops when already in place.

### Platform records

After DDL succeeds:

- **`platform.app_tables`** — all previous rows for the app are deleted and re-inserted
  (one row per table). Each row carries the full `SerializedSchema` JSON so the auto-REST
  router (M5) can resolve an app's schema in a single query without touching
  `information_schema`.

- **`platform.migrations`** — one row inserted with `(app_id, filename, checksum)` where
  `filename = "<epoch>_push"`. The checksum prevents redundant re-applies.

## Security

All DDL goes through `validateMigrationSQL` (M3) before execution. That function parses
every statement with `libpg-query` (WASM, no subprocess) and allowlists only:

- `CREATE TABLE` (must target `tenant_data` schema)
- `ALTER TABLE` with safe subtypes only (no `DROP COLUMN`, no `SET SCHEMA`)
- `CREATE INDEX` / `UNIQUE INDEX`
- `CREATE POLICY`
- `GRANT`

Any statement outside the allowlist throws a `SchemaError`, which the route catches and
returns as a 422 before touching the database.

## Related

- `packages/blaze/src/compile.ts` — `compileToDrizzle()`, M2
- `apps/blaze/src/migrations/generate.ts` — `generateMigrationSQL()`, M2
- `apps/blaze/src/migrations/validate-sql.ts` — `validateMigrationSQL()`, M3
- ADR 015 §5–§7 for the full migration pipeline design
