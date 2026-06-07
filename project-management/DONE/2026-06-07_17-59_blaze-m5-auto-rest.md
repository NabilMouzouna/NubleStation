# M5 — Blaze Auto-REST CRUD Endpoints

**Commit:** `dae3f15`
**Branch:** `feature/blaze`
**Date:** 2026-06-07

## What was built

| File | Role |
|---|---|
| `apps/blaze/src/db/query-builder.ts` | Pure SQL builder functions |
| `apps/blaze/src/db/schema-cache.ts` | 30s TTL in-memory cache over `platform.app_tables` |
| `apps/blaze/src/routes/db.ts` | 5 CRUD route handlers |
| `apps/blaze/src/server.ts` | Mounts `db` router |
| `docs/documentation/blaze-auto-rest.md` | Full design doc |

## Key decisions

- **withTenant for every query:** `SET LOCAL ROLE blaze_app` + `set_config('app.current_tenant', ...)` — RLS policy does the isolation automatically.
- **app_id injection via SQL:** INSERT uses `current_setting('app.current_tenant')::uuid` for `app_id` — client body cannot override it.
- **Schema from cache, never information_schema:** `getAppSchema()` reads `platform.app_tables` with 30s TTL.
- **Silent unknown-field drop:** PATCH silently ignores fields not in the schema (no error). POST returns 422 for missing required fields only.
- **Identifier safety:** All table/column names quoted with `"..."` in SQL even though they're schema-validated (defense in depth).
- **Pagination:** `limit` default 50, max 200. `offset` supported.
