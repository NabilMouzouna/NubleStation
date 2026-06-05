# Plan 01 — Blaze implementation (database service, Phase 3-4)

**Status:** Active
**Date:** 2026-06-06
**ADR:** [015](../adr/015-blaze-schema-dsl-and-migration-pipeline.md) (implementation) · [003](../adr/003-database-service-architecture.md) (architecture)
**Branch:** `feature/blaze-phase3` → merges to `staging`

---

## Why

Blaze is NubleStation's database service and its biggest piece. Phase 1 (platform schema, RLS `withTenant`, migration runner, HMAC, health) is built, but the developer-facing API is a 501 placeholder. This plan implements ADR 003 §6-§11 Phase 3-4 so a developer can define a typed `schema.ts`, run `nuble db push`, and immediately query with a Mongoose/Drizzle-like SDK over the LAN — with database-enforced cross-tenant isolation. Scope is **custom resources end-to-end**; built-in `users`, SSE, and escape hatches are deferred.

## Goal (acceptance)

```ts
// schema.ts
import { defineSchema, t } from "@nublestation/schema";
export default defineSchema({
  notes: { title: t.string().required(), body: t.string(), pinned: t.boolean().default(false) },
});
```
```sh
nuble db push --app demo        # compiles → uploads JSON → Blaze migrates → writes .nuble/types.ts
```
```ts
const nuble = createClient({ url, apiKey });
await nuble.db.notes.create({ title: "First" });
await nuble.db.notes.where({ pinned: true }).orderBy({ created_at: "desc" }).findMany();
// → only this app's rows; a second app sees none (RLS)
```

## Architecture

```
schema.ts (@nublestation/schema)  ──serialize──▶  JSON
nuble db push ──HTTP(JSON)──▶ Gateway ──HMAC──▶ Blaze
   migration runner: DSL JSON → Drizzle objs → drizzle-kit/api → SQL
   → inject app_id+RLS+ref-trigger → libpg-query allowlist
   → advisory lock → apply in tx → log platform.migrations + upsert app_tables
Query: nuble.db.notes.where(...).findMany() → /v1/blaze/db/notes?...
   → Gateway(HMAC) → router → validator → builder → withTenant() → Postgres(RLS)
```

## Reuse (do not reinvent)

| Use | For |
|---|---|
| `apps/blaze/src/db/connection-manager.ts` `withTenant()` | tenant tx for auto-REST executor **and** migration apply — unchanged |
| `apps/blaze/src/db/migrate.ts` | containment pattern for the drizzle-kit wrapper |
| `apps/blaze/src/db/schema/platform.ts` (`app_tables`, `migrations`) | snapshot store + checksum log — already exist |
| `apps/blaze/test/isolation.test.ts` + `test/helpers/tenant-data.ts` | RLS gate to extend; the exact policy/grant shape to reproduce |
| `packages/vault/src/vault.ts` + `packages/client/src/client.ts` | fluent fetch-client pattern for the new SDK |

## Components

- **C1 `packages/schema` (NEW `@nublestation/schema`)** — `builders.ts`, `define-schema.ts`, `serialize.ts` (canonical JSON + `canonicalChecksum`), `zod.ts` (server validator), `reserved.ts`, `compile/drizzle.ts` (Node), `compile/rls.ts`, `types.ts`. Dual export: `.` (browser-safe DSL) + `./compile` (Node, drizzle-orm).
- **C2 `apps/blaze/src/migrations/`** — `runner.ts` (single entry `runAppMigration`), `generate.ts` (drizzle-kit/api wrapper + prior-snapshot load), `validate.ts` (libpg-query allowlist), `apply.ts` (advisory lock, tx, log/upsert), `reserved.ts` (reserved + org-wide name reservation). Deps: move `drizzle-kit` to `dependencies`; add `libpg-query`, `@nublestation/schema`.
- **C3 Blaze routes** — `routes/admin.ts`, `rest/{router,validator,builder,execute}.ts`; modify `server.ts`; **delete** `routes/_placeholder.ts`; NEW platform migration for the `blaze_app` role + `tenant_data` grants.
- **C4 `packages/sdk` (`@nublestation/sdk`)** — `client.ts`, `db/collection.ts`, `db/proxy.ts`, `errors.ts`, `types.ts`.
- **C5 Type generation** — `packages/cli/src/codegen/types.ts` → `<project>/.nuble/types.ts`.
- **C6 CLI** — `packages/cli/src/commands/db-push.ts`; register `db` group in `index.ts`; add `jiti`.
- **C7 Gateway** — rename `DB_INTERNAL_URL`→`BLAZE_INTERNAL_URL` (`config.ts`, `proxy.ts`, `infra/docker-compose.yml`), keep `db` alias one release.
- **C8 Console** — `_create-app-dialog.tsx` `blazingdb`→`blaze`; Database tab copy + migration history (`lib/platform/app-detail.ts` `getMigrations`, wired in `[app]/page.tsx`).
- **C9 Tests** — extend `isolation.test.ts` to the generated table; `test/migrations/runner.test.ts`; `test/rest/*.test.ts`; SDK builder→URL unit tests.

## Build sequence (one confirmed slice + commit per milestone, on the feature branch)

| M | Slice | Verify |
|---|---|---|
| M1 | `@nublestation/schema` skeleton + serialize/zod/reserved | unit: stable round-trip JSON; reserved `users` rejected |
| M2 | DSL→Drizzle→SQL compiler over `drizzle-kit/api` (**risky first**) | golden: `generateMigration(empty, compile(notes))` emits `CREATE TABLE tenant_data.notes (… app_id uuid not null)` + index |
| M3 | Migration runner + admin route + **`blaze_app` role migration** | integration: `runAppMigration` writes `app_tables`/`migrations`; `notes` has `relrowsecurity` |
| M4 | **Cross-tenant RLS gate on the generated table** (critical) | `withTenant(appB)` sees 0 notes; cross-tenant insert fails `42501` |
| M5 | Auto-REST Layers 1-4; replace/delete placeholder | through HMAC: CRUD returns only caller rows; `?title=raw.DROP` rejected; >100 KB rejected |
| M6 | `@nublestation/sdk` `nuble.db.*` builder | builder→URL unit tests match M5; live round-trip |
| M7 | CLI `nuble db push` + type generation | fixture push applies migration + writes types; no-op rerun; incompatible redefinition → rename error |
| M8 | Gateway env rename + Console naming/migration-history | SDK works via `/v1/blaze/*`; Console shows tables + history + "Blaze" |

**Critical milestone = M4** (ADR 003 §20): if cross-tenant isolation holds on the production codegen path, the isolation story is real; the rest is execution.

## Risks (decided in ADR 015)

- drizzle-kit programmatic API is internal → pin `0.28.1`, isolate in `generate.ts`, golden test; hand-emitter fallback.
- libpg-query in Alpine → verify in-container at M3.
- `t.ref` trigger fires only on non-null refs; FK `onDelete` from the DSL.

## End-to-end verification

Postgres + gateway + Blaze running locally: fixture app with `schema.ts` (`notes`) → `nuble init` → `nuble db push --app demo` (migration logged, `.nuble/types.ts` written) → SDK create + `where().findMany()` returns only this app's rows → second app sees none → Console app-detail Database tab lists `notes` + the migration. All milestone suites green.

## Working rules

Each milestone is a "large" change (RULES.md): present + confirm, commit separately (`feat:`/`refactor:`, <72 chars, no AI signatures), document in `docs/documentation/`. Never stage the owner's unrelated WIP (`apps/bucket/*`, `packages/identity/`, their `pnpm-lock.yaml` edit). Branch flow: `feature/blaze-phase3` → `staging`.
