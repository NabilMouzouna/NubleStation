# NubleStation — Implementation Status

> Snapshot of what is actually built and working as of the current `dev` branch.

---

## Repository Layout

```
nublestation/
├── apps/
│   ├── gateway/        ← API Gateway (Hono, TypeScript)
│   ├── blaze/          ← Blaze — database service (Hono + Drizzle + PG)
│   ├── orbit/          ← Orbit — deploy service (Hono + busboy + unzipper)
│   ├── console/        ← Console — admin dashboard (Next.js 14 App Router)
│   └── docs/           ← Docs site (Astro Starlight → GitHub Pages)
├── packages/
│   ├── shared/         ← @nublestation/shared — HMAC primitives, header constants
│   ├── cli/            ← @nublestation/cli — nuble CLI (commander)
│   ├── assets/         ← logos + service SVGs
│   ├── sdk/            ← @nublestation/sdk (scaffold only — no src yet)
│   ├── ui/             ← shared UI components
│   └── eslint-config / typescript-config
├── infra/
│   ├── docker-compose.yml
│   ├── caddy/Caddyfile
│   ├── coredns/Corefile + Corefile.template
│   └── .env.example
└── scripts/
    ├── install.sh
    ├── dev-db-setup.sh
    ├── dev-seed.sh
    └── seed-admin.sql
```

---

## Infrastructure (`infra/`)

### Docker Compose

Services defined and wired:

| Service    | Image                                           | Exposed | Port  |
|------------|--------------------------------------------------|---------|-------|
| `caddy`    | `caddy:2-alpine`                                | LAN 80/443 | —  |
| `coredns`  | `coredns/coredns:1.11.3`                        | LAN 53 | —     |
| `postgres` | `postgres:16-alpine`                            | internal | —   |
| `console`  | `ghcr.io/…/nublestation-console:latest`         | `expose: 3000` | — |
| `api`      | `ghcr.io/…/nublestation-gateway:latest`         | `expose: 3000` | — |
| `blaze`    | `ghcr.io/…/nublestation-blaze:latest`           | `expose: 3001` | — |
| `orbit`    | `ghcr.io/…/nublestation-orbit:latest`           | `expose: 3002` | — |

All non-Gateway services use `expose:` (Docker-internal only). Gateway is the sole LAN entry.

Shared volume `nuble-apps` mounted rw on orbit, ro on caddy — the deploy → serve pipeline.

### Caddyfile

```
console.{ORG}.local:80  →  reverse_proxy console:3000
api.{ORG}.local:80      →  reverse_proxy api:3000
*.{ORG}.local:80        →  file_server /var/nuble/apps/{labels.1}/current  (SPA fallback)
```

`auto_https off` — LAN HTTP for now (ADR 004 decision).

### Corefile

Wildcard A-record template: all `*.{appbase}.local` → host IP. Forwards unknown to `8.8.8.8 / 1.1.1.1`.

---

## `packages/shared` — HMAC primitives

**`hmac.ts`**
- `sha256Hex(body)` — SHA-256 of bytes as hex
- `computeHmac(method, path, bodyHash, timestamp, secret, context?)` — SigV4-inspired canonical payload; context headers sorted lexicographically, lower-cased
- `verifyHmac(expected, presented)` — `timingSafeEqual` comparison

**`headers.ts`** — constants: `X_NUBLE_APP_ID`, `X_NUBLE_USER_ID`, `X_NUBLE_TIMESTAMP`, `X_NUBLE_SIG`, `X_NUBLE_APP_SLUG`, `HMAC_MAX_SKEW_MS = 30_000`

**`api-key.ts`** — `parseBearerToken()` — splits `nbl_<keyId>.<secret>` from Authorization header

---

## `apps/gateway` — API Gateway

**What it does:**
1. Parses `Authorization: Bearer nbl_<keyId>.<secret>`
2. Looks up `platform.api_keys` (Postgres JOIN with `platform.apps` to get slug)
3. Argon2id-verifies the secret
4. Resolves codename from path segment `[2]` of `/v1/{codename}/…`
5. Signs and proxies to the correct internal service

**Service registry (in `routes/proxy.ts`):**

| Codename | Internal URL env var    | `needsSlug` |
|----------|-------------------------|-------------|
| `orbit`  | `ORBIT_INTERNAL_URL`    | `true`      |
| `blaze`  | `DB_INTERNAL_URL`       | `false`     |
| `db`     | `DB_INTERNAL_URL` (legacy alias) | `false` |

Unknown codename → `404 unknown_service`. Key failure → single generic `401 unauthorized`.

**Signed forward headers:** `x-nuble-app-id`, `x-nuble-user-id`, `x-nuble-timestamp`, `x-nuble-sig`, `x-nuble-app-slug` (Orbit only).

**Health:** `GET /healthz` returns `{ ok: true }` — unauthenticated.

---

## `apps/blaze` — Database Service

**What's built:**
- Hono server, port `3001`
- HMAC middleware (`hmacAuth`) — enforces Gateway signature on all `/v1/*` routes
- Drizzle ORM, `drizzle.config.ts`, migration runner
- `routes/_placeholder.ts` — placeholder (real DB query routes not yet implemented)
- Health routes

**Platform schema** (`platform` Postgres schema, 8 tables):

| Table               | Purpose                                        |
|---------------------|------------------------------------------------|
| `organizations`     | Org name, subdomain root, admin email          |
| `users`             | Platform users (email, password_hash, role)    |
| `apps`              | Tenant apps (name = slug, display_name)        |
| `api_keys`          | `key_id` (plaintext lookup) + `secret_hash` (Argon2) |
| `user_app_access`   | Per-user per-app role grants                   |
| `app_tables`        | App-developer table registry + schema JSON     |
| `deployments`       | Deployment audit log (app, version, file_path) |
| `migrations`        | App-developer migration history + checksum     |
| `schema_version`    | NubleStation platform schema version tracking  |
| `audit_log`         | Actor + action + JSONB payload log             |

API key wire format: `nbl_<key_id>.<secret>`. `key_id` is the indexed plaintext lookup; `secret_hash` is Argon2id.

---

## `apps/orbit` — Deployment Service

**What's built:**
- Hono server, port `3002`
- HMAC middleware — enforces signature + also verifies `x-nuble-app-slug`
- `POST /v1/orbit/deploy` — receives zip via `multipart/form-data`, field `bundle` (50 MB limit)
- `POST /v1/orbit/rollback` — swaps `current/` ↔ `.previous/`
- `GET /healthz`, `GET /readyz`

**Atomic deploy flow** (`services/storage.ts`):
```
1. Write zip to  {storageRoot}/{slug}/.incoming-{ts}.zip
2. Extract to    {storageRoot}/{slug}/.incoming-{ts}/
3. Validate      index.html exists at root (422 if missing)
4. Swap:         rm .previous → mv current → .previous → mv .incoming → current
5. Cleanup:      rm zip + failed incoming dir (finally block)
```

Slug is validated against `/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/` and path-traversal checked with `resolve()` before any FS operation.

After swap, inserts into `platform.deployments` (best-effort, non-fatal on failure).

---

## `apps/console` — Admin Dashboard (Next.js 14)

**What's built:**
- App Router, standalone mode
- Auth: email/password login, server actions, `better-sqlite3` for admin session DB
- Session management via `lib/auth/session.ts`
- Platform DB queries via `lib/platform/` (Postgres pool — `apps.ts`, `app-detail.ts`, `events.ts`)

**Routes:**

| Route               | Description                             |
|---------------------|-----------------------------------------|
| `/auth`             | Login page                              |
| `/dashboard`        | Overview dashboard                      |
| `/apps`             | App list + create dialog                |
| `/apps/[app]`       | App detail (API keys, stats)            |
| `/watch`            | Deploy log viewer (SSE from DB)         |
| `/network`          | Network status page                     |
| `/storage`          | Storage overview                        |
| `/admins`           | Admin user management                   |
| `/audit`            | Audit log                               |
| `/settings`         | Platform settings                       |
| `/api/logs/deploy`  | SSE endpoint for live deploy events     |

`createApp()` in `lib/platform/apps.ts`: inserts into `platform.apps`, generates `nbl_<keyId>.<secret>` pair, Argon2id-hashes the secret, inserts into `platform.api_keys`. Returns plaintext key once (never stored again).

---

## `packages/cli` — `nuble` CLI

**Commands:**

| Command          | What it does                                                           |
|------------------|------------------------------------------------------------------------|
| `nuble init`     | Prompts gateway URL / API key / app slug, tests reachability, writes `~/.nuble/config` (TOML) |
| `nuble deploy`   | Zips `dist/` (or `--dist`), POSTs to `/v1/orbit/deploy`, prints version |
| `nuble status`   | Reads config, checks gateway `/healthz` for each profile              |

Config file: `~/.nuble/config` (TOML, `[default]` / named profiles). Fields: `org_url`, `api_key`, `app_slug`.

`NUBLE_GATEWAY_URL` env var skips the URL prompt in `nuble init` (used by `install.sh`).

---

## `apps/docs` — Documentation Site

- **Framework:** Astro + Starlight
- **Deployed:** GitHub Pages at `https://nabilmouzouna.github.io/NubleStation`
- **Trigger:** push to `dev` branch (paths: `apps/docs/**`, `packages/assets/**`, `.github/workflows/docs.yml`)
- **Deploy action:** `peaceiris/actions-gh-pages@v4` → pushes to `gh-pages` branch

**26 pages** across: Getting Started, Core Concepts, Services, SDK, CLI, Infrastructure, Security, Reference.

---

## Security model summary

| Layer                  | Mechanism                                                  |
|------------------------|------------------------------------------------------------|
| Client → Gateway       | `Bearer nbl_<keyId>.<secret>` — Argon2id verify           |
| Gateway → Service      | HMAC-SHA256 signed headers (SigV4-inspired canonical)      |
| Replay prevention      | Timestamp ±30 s skew window                               |
| Body tamper detection  | SHA-256 of body in signed payload                          |
| Tenant isolation       | `app-id` + `user-id` (+ `app-slug` for Orbit) in signature |
| Network isolation      | Services use `expose:` only — no LAN ports except Gateway  |
| Timing attacks         | `timingSafeEqual` on HMAC; `argon2.verify` on key check    |
| Info leak prevention   | Single generic `401` for all auth failures                 |

---

## What's NOT implemented yet

| Item                        | Status                                       |
|-----------------------------|----------------------------------------------|
| Identity service            | Not started (`apps/identity/` absent)        |
| Vault service               | Not started (`apps/vault/` absent)           |
| SDK (`@nublestation/sdk`)   | Package scaffolded, no `src/` yet            |
| Blaze query routes          | Placeholder only (`routes/_placeholder.ts`)  |
| `install.sh` full flow      | Script exists, completeness unknown          |
| RLS / per-tenant Postgres   | Schema tracks tables but RLS not yet in Blaze routes |
| SSE real-time subscriptions | Planned (SDK roadmap)                        |
| HTTPS / TLS on LAN          | `auto_https off` — deferred (ADR 004)        |

---

## ADRs (10 recorded)

| ADR | Decision |
|-----|----------|
| 001 | Separate API and Console containers |
| 002 | Console design system (shadcn/ui) |
| 003 | Database service architecture (Blaze — Hono + Drizzle + PgBouncer) |
| 004 | LAN TLS strategy (deferred — HTTP for now) |
| 005 | Install-to-console flow |
| 006 | Install script design |
| 007 | Orbit deployment service (atomic swap, busboy streaming) |
| 008 | CLI + SDK architecture (separate packages, TOML config) |
| 009 | Plug-and-play service contract (3 invariants, locked) |
| 010 | SigV4-inspired HMAC canonical request (signed context headers) |
