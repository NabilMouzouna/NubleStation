# M4 — Blaze Migration Apply Route + Advisory-Lock Runner

**Commit:** `dbd2246`
**Branch:** `feature/blaze`
**Date:** 2026-06-07

## What was built

| File | Role |
|---|---|
| `apps/blaze/src/migrations/apply.ts` | `applyMigration(appId, schema)` — core runner |
| `apps/blaze/src/routes/admin.ts` | `POST /v1/blaze/admin/apps/:appId/migrations` |
| `apps/blaze/src/server.ts` | Mounts `admin` router before `placeholder` |
| `docs/documentation/blaze-migration-apply.md` | Full pipeline doc |

## Key decisions

- **Advisory lock:** `pg_advisory_xact_lock(hashtext('migrations:<appId>'))` inside the transaction — serializes concurrent pushes from the same app without a separate lock table.
- **Checksum de-dup:** `canonicalChecksum(schema)` compared against the last `platform.migrations` row — returns `{ noOp: true }` if unchanged, zero DB writes.
- **Bootstrap is inline:** `blaze_app` role + `tenant_data` schema created on first push (idempotent `DO $$` block + `CREATE SCHEMA IF NOT EXISTS`) — no separate platform migration needed for M4.
- **app_tables strategy:** DELETE + re-INSERT per push (one row per table, full schema JSON in each row). Globally unique `table_name` constraint prevents two apps from claiming the same table.
- **Security:** All DDL still passes through `validateMigrationSQL` (M3 allowlist) before any query runs. `SchemaError` is caught and returned as 422.
- **Cross-app protection:** Route param `:appId` verified against `c.var.appId` from HMAC headers.

## Tests

All 10 existing migration tests still pass (no new tests for `apply.ts` — integration-level and requires a live DB, covered by M4 E2E later).
