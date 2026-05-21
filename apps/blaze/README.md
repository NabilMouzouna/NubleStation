# @nublestation/blaze

**Blaze** — the database service. Owns the Postgres connection, the platform
schema migrations (`platform.*`), the connection manager that enforces tenant
isolation via `SET LOCAL app.current_tenant`, and the HMAC-protected `/v1/db/*`
surface that the Gateway forwards into.

See `docs/adr/003-database-service-architecture.md` for the authoritative
architecture; this README only covers running and testing the service.

> Note: inside this app, `src/db/` is the database-access layer (pool, schema,
> migrations) — not the service name. The service is Blaze; the folder name
> describes what's inside.

---

## Local development on a Mac (no Docker)

Prereqs: Postgres 14+ installed locally (Homebrew is fine). Confirm with
`pg_isready`.

### 1. Bootstrap the local role + databases

Idempotent — safe to re-run.

```sh
bash scripts/dev-db-setup.sh
```

Creates:

- role `nuble` (`LOGIN`, `CREATEDB`, password `nuble`)
- database `nuble_dev`  (owned by `nuble`) — for `pnpm blaze:dev`
- database `nuble_test` (owned by `nuble`) — for `pnpm blaze:test`

### 2. Create `.env.local`

```
DATABASE_URL=postgres://nuble:nuble@localhost:5432/nuble_dev
DATABASE_URL_TEST=postgres://nuble:nuble@localhost:5432/nuble_test
INTERNAL_HMAC_SECRET=dev-secret-not-for-prod-must-be-min-16
PORT=3001
LOG_LEVEL=info
NODE_ENV=development
```

### 3. Apply platform migrations

```sh
pnpm blaze:migrate
```

Runs every SQL file in `apps/blaze/drizzle/` and writes a row to
`platform.schema_version`. Re-running is a no-op (Drizzle's journal is the
source of truth).

### 4. Start the dev server

```sh
pnpm blaze:dev    # apps/blaze on :3001
pnpm gateway:dev  # apps/gateway on :3000 (in a second terminal)
```

Sanity check:

```sh
curl localhost:3001/healthz    # → {"ok":true}
curl localhost:3001/readyz     # → {"ok":true,"schemaVersion":"0000_..."}
```

### 5. Seed a demo API key (optional, for end-to-end testing)

```sh
pnpm --filter @nublestation/blaze exec tsx scripts/seed-demo.ts
```

Prints a JSON blob containing `apiKey: nbl_<id>.<secret>`. Use it:

```sh
curl -H "Authorization: Bearer nbl_<id>.<secret>" http://localhost:3000/v1/db/_ping
# → 501 from the placeholder route, proving the gateway HMAC chain is wired
```

---

## Testing

```sh
pnpm blaze:test
```

Runs Vitest against `nuble_test`. The suite includes the **Phase 1 gating
test** — `test/isolation.test.ts` — which proves cross-tenant RLS isolation per
ADR 003 §20 Phase 1 Step 4.

To run the whole monorepo's test tasks via turbo:

```sh
pnpm test
```

---

## Mac → Docker: env-swap, no code change

Blaze is portable by environment file. Switching from native Mac Postgres to
the Dockerized staging stack does **not** require any code edit:

| Setting             | Mac (native)                            | Docker (staging)                                |
| ------------------- | --------------------------------------- | ----------------------------------------------- |
| `DATABASE_URL`      | `postgres://nuble:nuble@localhost:5432/nuble_dev` | `postgres://nuble:${POSTGRES_PASSWORD}@postgres:5432/nuble` (or PgBouncer host) |
| `BLAZE_INTERNAL_URL`| `http://localhost:3001`                 | `http://blaze:3000`                             |
| `NUBLE_ENV_FILE`    | `.env.local` (default)                  | `.env.docker` (set by Compose)                  |

`apps/blaze/src/config.ts` loads whichever file `NUBLE_ENV_FILE` points at (or
`.env.local` if unset). Compose passes `NUBLE_ENV_FILE=.env.docker` to the
blaze container.

---

## What's in this app (Phase 1 scope)

- `src/db/schema/platform.ts` — 10 platform tables (organizations, users,
  apps, api_keys (with indexed `key_id`), user_app_access, app_tables,
  deployments, migrations, schema_version, audit_log).
- `src/db/connection-manager.ts` — `withTenant(appId, fn)`: BEGIN +
  `set_config('app.current_tenant', $1, true)` + COMMIT/ROLLBACK. The
  safety-critical layer. ADR §5.
- `src/db/migrate.ts` — platform migration runner; also CLI for
  `pnpm blaze:migrate`. Runs at Blaze boot, fails-fast on error. ADR §11.
- `src/middleware/hmac.ts` — verifies the gateway's HMAC signature before any
  `/v1/*` route. ADR §14.
- `src/routes/_placeholder.ts` — `/v1/db/*` returns 501 until Phase 3
  (auto-REST router) lands.

## What's NOT in Phase 1 (don't add without an ADR)

SSE / `LISTEN/NOTIFY`, schema DSL parser, `nuble db push`, auto-REST router,
query validator/builder, app-developer migration runner, escape hatches,
SDK & CLI implementations, OIDC, Lucia, console wiring, `/v1/admin/*` routes,
Redis cache for key lookups, PgBouncer on Mac, audit-log emission, body
streaming through the gateway, real session resolution in the gateway.
