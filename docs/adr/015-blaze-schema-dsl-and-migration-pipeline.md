# ADR 015 — Blaze schema DSL, migration pipeline & SDK (implementation)

**Status:** Accepted
**Date:** 2026-06-06
**Project:** NubleStation
**Authors:** Nabil Mouzouna
**Supersedes:** —
**Builds on:** ADR 003 (Blaze architecture), ADR 008 (CLI/SDK architecture), ADR 009 (service contract)

---

## Context

ADR 003 is the **architecture** of Blaze — defense-grade, exhaustive, but conceptual. Blaze Phase 1 is built (platform schema, migration runner, RLS `withTenant`, HMAC middleware, health checks); the developer-facing query API is still a 501 placeholder (`apps/blaze/src/routes/_placeholder.ts`). This ADR records the **implementation-level** decisions needed to build ADR 003 §6-§11 Phase 3-4 — the schema DSL, the schema→Drizzle→SQL migration pipeline, the auto-REST query surface, the runtime SDK, and the `nuble db push` CLI — and to "welcome Blaze" across the gateway and console.

ADR 003 stays the immutable architecture record. Where this ADR makes a concrete choice ADR 003 left open (notably *how* migrations are generated), this ADR is authoritative for implementation.

---

## Decisions

### 1. The schema DSL is a new package, `@nublestation/blaze`

> **Implementation note (2026-06-06):** The package was originally named `@nublestation/schema` in this ADR's draft. The actual package is `@nublestation/blaze` (`packages/blaze/`) — the bare name follows the repo convention where the client package takes the service codename (same as `@nublestation/vault` / `@nublestation/identity`). The service container remains `@nublestation/blaze-service`. Any tooling or docs that still reference `@nublestation/schema` or `packages/schema` are stale.

The "Blaze schema model" the developer writes (ADR 003 §6) lives in `packages/blaze/`, separate from the SDK and CLI (same separation rationale as ADR 008 §1).

**DSL surface — model-wrapper shape.** Each table is defined as `t.model({ …fields }).index(col)`. The `t.model()` wrapper carries the field map plus a per-model config slot (`.index()` now; `.unique([])`, `.authorization()`, composite constraints later) with no future breaking change to any `schema.ts`. A bare field map `{ tableName: { col: t.string() } }` is also accepted and normalized to a model, keeping all ADR 003 §6 examples valid.

**Subpath exports:**
- **`.` (browser-safe):** `defineSchema`, the `t` builders (`string/number/decimal/boolean/uuid/json/timestamp/enum/ref`), `serializeSchema`, `canonicalJson`, `canonicalChecksum`, and all public + inferred types (`InferRow`, `InferInsert`, `InferSchema`). **Zero runtime deps** — nothing in this import graph touches `zod` or `drizzle-orm`, so it never bloats the browser SDK bundle.
- **`./validate` (Node/server):** `toZodSchema(table, "insert"|"update")` for Blaze write-payload validation. Imports `zod`; kept behind a subpath so `zod` cannot leak into browser bundles.
- **`./compile` (Node/server, M2):** `compileToDrizzle()` and the RLS/trigger/grant SQL templates. Imports `drizzle-orm`; declared in M2, not M1.
- **Wire format:** `defineSchema(...)` serializes to a canonical `SerializedSchema` JSON (stable key order via `canonicalJson`; checksum via Web Crypto `sha256`). This JSON — never SQL — travels on the wire and is stored in `platform.app_tables.schema_json`. Upholds ADR 003 §6/§17 "no SQL on the wire."

### 2. Migrations are generated **server-side, in-process**, via drizzle-kit's programmatic API

This resolves the open question in ADR 003 ("Migration runner: Drizzle Kit with custom wrapper") and the project owner's "SDK or CLI?" question.

- `nuble db push` compiles the developer's `schema.ts` locally and uploads the **`SerializedSchema` JSON** to Blaze. It does **not** generate or upload SQL.
- Blaze compiles the JSON → in-memory Drizzle table objects → migration SQL using **`drizzle-kit/api`** (`generateDrizzleJson`, `generateMigration`), then validates and applies it. `generateMigration(prev, cur)` diffs two snapshots and returns SQL statement strings; `generateDrizzleJson` accepts **in-memory** Drizzle objects (not `.ts` files on disk) — verified present in the pinned `drizzle-kit@0.28.1` at the `drizzle-kit/api` export.

**Why server-side, not CLI-side:**
- **Trust boundary** — keeps SQL off the wire (ADR 003 §6/§17); Blaze remains the single SQL author.
- **Determinism** — `app_id` injection, the RLS policy, the `t.ref` cross-schema FK + access trigger, and reserved-name checks are platform policy that must run server-side regardless. CLI-side generation would duplicate them.
- **Single code path** — the migration runner is one callable library with three entry points (CLI, Console admin, Orbit) per ADR 003 §11. Server-side generation is the only design where all three share it.
- **Snapshot store** — the authoritative previous snapshot is per-app and server-side (`platform.app_tables`). The dev machine can't reliably hold it (multiple clones/developers).

**Containment of the undocumented API:** `drizzle-kit/api` is an internal export whose shape can shift between versions. Mitigation: pin `drizzle-kit` exactly, isolate every call behind one module (`apps/blaze/src/migrations/generate.ts`), and add a golden test asserting a known DSL yields the expected `CREATE TABLE`. Same containment already used for the platform-migration wrapper (`apps/blaze/src/db/migrate.ts`). **Fallback** if a bump breaks it: a hand-written DSL→SQL emitter (more code, fully controlled) behind the same module boundary.

### 3. RLS / `app_id` / `t.ref` injection is two-pass

drizzle-kit only knows the columns it is handed, so:
1. The compiled Drizzle table already includes `app_id uuid NOT NULL` + its index → drizzle emits them in `CREATE TABLE` for free.
2. After `generateMigration` returns the DDL, the runner **appends** what drizzle cannot express, from fixed templates, per newly-created table:
   `ENABLE`/`FORCE ROW LEVEL SECURITY`; `CREATE POLICY tenant_isolation` (`USING` + `WITH CHECK` on `app_id = current_setting('app.current_tenant')::uuid`); `GRANT SELECT,INSERT,UPDATE,DELETE … TO blaze_app`; and, per `t.ref`, a `BEFORE INSERT OR UPDATE` trigger checking `user_app_access` (fires only on non-null refs; `onDelete` follows the DSL option). These match the shapes already proven in `apps/blaze/test/helpers/tenant-data.ts`, so the production path reproduces the structure the isolation test validates.

### 4. Drift guard = checksum of the canonical DSL JSON; concurrency = advisory lock

`platform.migrations.checksum` stores the `sha256` of the canonical `SerializedSchema` JSON for the push (the DSL JSON, not hand-edited SQL, is the source of truth). The apply transaction takes `pg_advisory_xact_lock(hashtext('migrations:'||app_id))` as its first statement (ADR 003 §11), serializing concurrent pushes per app.

### 5. SQL validation uses a real parser allowlist

Generated SQL is validated with **`libpg-query`** (the maintained WASM build of Postgres' parser — the "`pg-query-parser`" named in ADR 003 §15) — never regex. Allow only `CREATE TABLE / ALTER TABLE / CREATE INDEX / CREATE VIEW` plus the platform-appended RLS/trigger/grant statements; reject `DROP DATABASE/SCHEMA`, raw `CREATE POLICY` from user input, and references outside `tenant_data` / `platform.users`. (Must verify the WASM parse runs in the Blaze Alpine container.)

### 6. Auto-REST surface: Layers 1-4 under the codename prefix

Replaces the placeholder with the ADR 003 §8 pipeline: Router (reads `platform.app_tables` scoped to `c.var.appId`, never `information_schema`) → Validator (PostgREST-style filters + JSONB ops + quotas: 1000 rows / 100 KB / `statement_timeout`) → Builder (parameterized SQL via Drizzle's `sql` tag, never string-built) → Executor (the existing `withTenant()`).

Endpoints standardize on the **codename** prefix `/v1/blaze/*` (ADR 009 service contract), not ADR 003's literal `/v1/db/*` and `/v1/admin/*`:
- `GET|POST|PATCH|DELETE /v1/blaze/db/{table}[/:id]` — tenant CRUD.
- `POST /v1/blaze/admin/apps/:appId/migrations`, `GET /v1/blaze/admin/apps/:appId/{tables,migrations}` — developer-scoped admin (API-key auth, same HMAC chain). The legacy `db` segment alias is kept at the gateway for one release.

### 7. Production `blaze_app` role is a hard prerequisite

`withTenant` runs `SET LOCAL ROLE blaze_app`, but today only the test helper creates that role. A new platform migration must create `blaze_app` (NOLOGIN), ensure the `tenant_data` schema, and grant it `USAGE`. Without this the auto-REST path fails in a real container. (DB-schema change → applied via the existing boot migration runner.)

### 8. Runtime SDK gives the Mongoose/Drizzle-like feel

`@nublestation/sdk` (currently empty) is built to mirror `packages/vault`'s fluent fetch-client. `createClient({ url, apiKey })` exposes `nuble.db.<table>` (via a `Proxy`) returning a chainable `Collection`: `.where().include().orderBy().limit().offset().select()` with terminals `.findMany/.findOne/.create/.update/.delete/.aggregate`. Each compiles to a `/v1/blaze/db/...` REST URL. `include` is limited to **one level** in this phase.

### 9. `nuble db push` + generated types close the loop

The CLI loads `schema.ts` (via `jiti`), serializes, POSTs the JSON, prints applied statements, and writes `<project>/.nuble/types.ts` (per-table `Row`/`Insert` + a `Database` interface) so `nuble.db.tasks.where({status})` autocompletes enum values. Gated per ADR 008 (`NOT_AVAILABLE` if Blaze is unreachable).

### 10. Phase boundary (scope)

In scope now: **custom resources end-to-end** (`nuble.db.*`). Deferred (unchanged from ADR 003): built-in `nuble.users.*` and the `tenant_data` views (couple to Identity), SSE `.subscribe()`, and the escape hatches (computed fields, named queries, raw SQL).

---

## Consequences

- Developers write one typed `schema.ts`, run `nuble db push`, and immediately query with a Mongoose/Drizzle-like SDK over the LAN — with database-enforced cross-tenant isolation proven on the production codegen path.
- Blaze stays the single SQL author; no SQL crosses the wire; one migration-runner library serves CLI/Console/Orbit.
- A new runtime dependency on an internal drizzle-kit API is accepted, contained behind one module + a golden test, with a hand-emitter fallback.
- `DB_INTERNAL_URL`→`BLAZE_INTERNAL_URL` and the `blazingdb`→`blaze` console naming are corrected; the legacy `db` route alias lingers one release.

## References

- ADR 003 — Blaze architecture (§6 DSL, §7 tiers, §8 layers, §9 wire protocol, §11 migrations, §20 implementation order)
- ADR 008 — CLI/SDK split, `nuble db push` gating
- ADR 009 / `docs/documentation/service-contract.md` — `/v1/{codename}/*` prefix
- Implementation plan: `docs/plans/01-blaze-implementation.md`
