# M6 — Blaze Runtime SDK (createBlazeClient)

**Commit:** `1c77618`
**Branch:** `feature/blaze`
**Date:** 2026-06-07

## What was built

| File | Role |
|---|---|
| `packages/blaze/src/client.ts` | `createBlazeClient<S>()` implementation |
| `packages/blaze/src/index.ts` | Exports `createBlazeClient`, `BlazeClient`, `TableClient` |

## Key decisions

- **Proxy-based `db` object:** `new Proxy({}, { get: (_, tableName) => tableClient(tableName) })` — no pre-enumeration of tables needed; typed via mapped types over `TableMap<S>`.
- **Type inference via schema param:** Developer passes `schema` to `createBlazeClient({ baseUrl, apiKey, schema })`, TypeScript infers `S` and produces `BlazeClient<S>` with per-table CRUD types.
- **No schema at runtime:** The schema param drives TypeScript only — the implementation ignores it and relies on the server to validate table names.
- **Auto-unwrap:** All methods return `data` from `{ data: ... }` responses directly — no wrapper object in the SDK.
- **DELETE returns void:** `delete()` resolves to `void` (no row returned in the response).
- **Error on non-2xx:** `req()` helper throws an `Error` with the status and body text on any non-OK response.
