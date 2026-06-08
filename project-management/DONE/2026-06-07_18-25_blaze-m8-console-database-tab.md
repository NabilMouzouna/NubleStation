# M8 — Console Database Tab

**Commit:** `60e7029`
**Branch:** `feature/blaze`
**Date:** 2026-06-07

## What was built

| File | Role |
|---|---|
| `apps/console/lib/platform/app-detail.ts` | Added `schema_json` to `AppTableRow`, added `MigrationRow` type + `getMigrations()` |
| `apps/console/app/(shell)/apps/[app]/page.tsx` | Added `getMigrations` to parallel fetch, passes `migrations` prop |
| `apps/console/app/(shell)/apps/[app]/_app-detail-client.tsx` | Enriched `DatabaseTab` with per-table column badges and migration history |

## What the Database tab now shows

1. **Tables section** — one card per table, with:
   - Table name (monospace)
   - Column count
   - Column badges: `colName type` (auto-injected `id: uuid` and `app_id: uuid` shown first)
   
2. **Migration history section** (hidden when no migrations) — table showing:
   - Run filename (e.g. `1749307346132_push`)
   - Checksum (first 12 chars + ellipsis)
   - Applied timestamp

## Key decisions

- **Deduplicate by table_name:** `platform.app_tables` stores one row per table, but all rows for the same app have the same `schema_json` (full schema). The tab deduplicates by `table_name` to avoid rendering the same table twice if there are multiple rows.
- **schema_json nullable:** `AppTableRow.schema_json` typed as nullable — the tab falls back to showing only `id` and `app_id` if schema is absent (shouldn't happen in practice but defensive).
- **Pre-existing TS2742 errors ignored:** The console project has pre-existing React type portability errors (TS2742) across all components; not related to M8 changes.
