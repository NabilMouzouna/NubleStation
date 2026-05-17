Here's the context to drop into Claude Code. Save it as `CLAUDE.md` at the repo root — Claude Code reads this automatically and uses it for every task.

---

```markdown
# NubleStation — Project Context for Claude Code

> Read this first. It defines what we're building, why, and the constraints you must respect.

---

## What NubleStation Is

NubleStation is a **self-hosted, plug-and-play backend infrastructure platform** for small organizations (target: clinics, 10-50 staff). Think "Synology NAS for developers" — install once on any LAN machine and the organization gets a complete backend (auth, database, file storage, frontend hosting) accessible from any device on the network via friendly subdomains like `console.nuble.local`.

**One-line pitch:** *NubleStation turns any machine in a clinic into a private cloud — one installation gives every developer on the network stable URLs, shared backend services, and hosted frontends, with zero internet dependency.*

This is a **Final Year Project (PFE)** in Network and Telecommunications Engineering, ~1 month build budget, solo developer.

---

## Naming

- The product is **NubleStation** (was originally "AppBase" but that's taken on npm/GitHub)
- Default organization domain placeholder is `nuble.local`
- npm scope: TBD (likely `@nublestation/...`)
- Docker images: GHCR under the developer's GitHub namespace

---

## The Problem We Solve

| Existing Solution | Why It Fails for Clinics |
|---|---|
| Firebase / Supabase Cloud | Patient data cannot leave premises (compliance) |
| Self-hosted Supabase / Appwrite | Requires DevOps expertise the clinic doesn't have |
| PocketBase / single-binary tools | No multi-app isolation, no LAN-native networking |
| Custom servers per app | Heavy footprint, no shared services, no SSO |

**The gap:** No solution combines BaaS services + LAN-native networking + plug-and-play installation in a single product deployable on commodity hardware in under 10 minutes.

---

## Core Architectural Decisions (Non-Negotiable)

1. **Single-host, multi-tenant.** One NubleStation install per organization, hosting many apps as logical tenants (rows in a DB, not containers).
2. **Docker Compose, not Kubernetes.** Single-host orchestration only.
3. **Apps are database rows, not containers.** Creating an app inserts a row + issues an API key. No process spawned.
4. **Frontends are static files served by Caddy.** Devs build SPAs locally and upload `dist/` folders. No SSR.
5. **PostgreSQL, not SQLite.** Multi-tenant concurrent writes need real concurrency.
6. **DNS: CoreDNS only.** Router DNS (or per-device hosts file) must point at the host. mDNS removed — every device requires LAN DNS configuration.
7. **Caddy for reverse proxy.** Auto-HTTPS, simple config, built-in subdomain routing.
8. **Custom org domain.** User picks org name at install; everything becomes `*.{org}.local`.
9. **Authorization enforced at platform layer.** `user_app_access` table + middleware. Never delegated to developers.
10. **Ops-first build order.** Build the infrastructure shell (installer, Caddy, DNS, Compose) before refactoring services.

---

## The Architecture

```
LAN — *.nuble.local
│
└── Single Host Machine
      │
      └── Docker Compose Stack
            ├── Caddy           (reverse proxy, port 80/443)
            ├── CoreDNS         (DNS authority for *.nuble.local, port 53)
            ├── API Gateway     (the only service exposed on the LAN; auth/key resolution, routing)
            ├── Auth Service    (own container — one process per container)
            ├── DB Service      (own container)
            ├── Storage Service (own container)
            ├── Deploy Service  (own container)
            ├── Console (UI)    (Next.js admin dashboard)
            ├── PgBouncer       (transaction-pooling in front of Postgres)
            ├── Redis           (API-key cache, sub-ms lookups)
            └── PostgreSQL      (tenant-scoped data)
```

**File storage:** local volume `/var/nuble/`, no MinIO/S3 in scope.

### Routing Map

| URL | Routes To |
|---|---|
| `console.{org}.local` | Admin dashboard (Next.js) |
| `api.{org}.local` | API Gateway (single exposed entry point; routes to internal services) |
| `{appname}.{org}.local` | Static files of deployed frontend |

### How Caddy and CoreDNS Relate

They are **parallel**, not chained. CoreDNS answers DNS queries on port 53. Caddy serves HTTP on port 80. They never talk to each other.

```
Phone → DNS query (port 53)  → CoreDNS → "192.168.1.100"
Phone → HTTP request (port 80) → Caddy → forwards to right container
```

### DNS Strategy on the LAN

- **CoreDNS** is the sole resolver for `*.{org}.local` — every device must point at the host for DNS
- **Router DNS** configured to forward queries to the host (or set as primary DNS via DHCP option 6) — one-time clinic IT setup, required for all devices
- **DHCP reservation** on router to lock host's IP to its MAC — required so the address baked into Corefile stays valid
- **Per-device fallback** (hosts file edit) only for testing or when router config isn't possible

---

## API Gateway Model

There is **one API origin**: `api.{org}.local`. Internally it routes by path:

```
api.{org}.local/auth/*     → auth module
api.{org}.local/db/*       → database module
api.{org}.local/storage/*  → storage module
api.{org}.local/deploy/*   → deployment module
```

These 4 services are **separate containers** (one process per container — Docker best practice), reachable only on the internal Docker network. Only the **API Gateway** is exposed on the LAN; it resolves the API key → `app_id`, authenticates the session, and forwards to the right service over the internal network with **signed internal headers** (HMAC, shared secret in `.env`) so a compromised app container can't spoof another tenant. Services do not share a process or a connection pool with each other — they share only the Postgres instance (via PgBouncer). See ADR 003 §14 for the authoritative topology.

**Reason for one origin:** avoids CORS hell, simplifies SDK config, matches Supabase/Firebase convention.

---

## Real-Time Capabilities

- ✅ **SSE (Server-Sent Events)** via Postgres `LISTEN/NOTIFY` — covers 90% of clinic needs
- ⚠️ WebSockets — not in PFE scope, mentioned as future work
- ❌ AppSync-style GraphQL subscriptions — out of scope
- ❌ Offline sync — out of scope

---

## Tech Stack

| Layer | Technology |
|---|---|
| Language | TypeScript |
| Package manager | pnpm |
| Monorepo | Turborepo |
| API framework | Hono (decided — see ADR 003 / roadmap) |
| Frontend (Console) | Next.js 14 |
| Database | PostgreSQL 16 |
<<<<<<< HEAD
| ORM | Drizzle (decided — see ADR 003) |
| Cache | Redis 7 (API-key resolution; see ADR 003 §15) |
| Auth | Lucia or custom (sessions + API keys) |
=======
| Connection pooler | PgBouncer (transaction pooling) |
| Cache | Redis 7 (API-key resolution) |
| ORM | Drizzle (decided — ADR 003 §15) |
| SQL validation | `pg-query-parser` (never regex SQL) |
| Auth | Lucia v3 + `oidc-provider` (sessions + API keys + SSO) |
>>>>>>> main
| Reverse proxy | Caddy 2 |
| DNS | CoreDNS only (mDNS removed — decision #6) |
| Container runtime | Docker + Compose |
| Testing | Vitest + Playwright |
| CI | GitHub Actions |
| Container registry | GHCR (GitHub Container Registry) |
| npm | Public scoped packages |

---

## Repository Layout

```
nublestation/
├── apps/                        ← each dir = one Docker container (one process per container)
│   ├── gateway/                 ← API Gateway: only exposed service; key/session auth, routing
│   ├── auth/                    ← Auth service (sessions, API keys, OIDC/SSO)
│   ├── db/                      ← Database service (auto-REST, RLS, migrations) — ADR 003
│   ├── storage/                 ← Storage service (file bytes + metadata)
│   ├── deploy/                  ← Deploy service (frontend bundle uploads)
│   └── console/                 ← Next.js admin dashboard (consumes /v1/admin/*)
├── packages/                    ← things that become npm packages
│   ├── sdk/                     ← @nublestation/sdk — used by app developers
│   ├── cli/                     ← @nublestation/cli — the `nuble` command
│   └── shared/                  ← shared types/utils
├── infra/                       ← infrastructure config (not code)
│   ├── docker-compose.yml
│   ├── caddy/Caddyfile
│   ├── coredns/Corefile
│   └── placeholders/            ← used until real services exist
├── scripts/
│   └── install.sh               ← curl ... | bash target
├── docs/adr/                    ← architecture decision records
└── .github/workflows/
    ├── ci.yml                   ← runs on every push (lint/test/build)
    └── release.yml              ← runs on push to main (publish everything)
```

---

## Branch & Release Strategy

- `main` — stable. Push/merge here triggers **publish** (npm + Docker images + GitHub Release).
- `staging` — integration. CI runs, no publish.
- `dev` — daily work. CI runs, no publish.
- `feature/*` — short-lived, merge into `dev`.

**Versioning:** `0.x.y` during development. Defense day = `1.0.0`.

---

## End-to-End Flow (What We're Building Toward)

1. **Install** — `curl -sSL https://.../install.sh | bash`. Asks for org name + admin password. Detects host IP. Writes `.env`. Starts Compose. Prints `✅ Open http://console.{org}.local`.
2. **Admin setup** — admin opens `console.{org}.local`, creates an app "tasks" → reserves `tasks.{org}.local` and issues an API key.
3. **Developer build & deploy** — developer codes locally with `@nublestation/sdk`, runs `nuble deploy --app tasks`. CLI zips `dist/` and uploads via API. Caddy serves it.
4. **End user** — nurse's tablet (configured to use the host as DNS, via router) opens `tasks.{org}.local`, CoreDNS resolves it, app loads, SSO works across all org apps.

---

## Out of Scope (Don't Suggest These)

- ❌ Local LLM API
- ❌ Cross-OS native installers (Linux only for PFE)
- ❌ Git-based deployment (CLI only)
- ❌ SSR frontend hosting (static SPAs only)
- ❌ Multi-host clustering, auto-scaling, load balancing
- ❌ Built-in CI/CD pipelines for deployed apps
- ❌ S3-compatible storage layer (local filesystem only)
- ❌ Mobile native SDK
- ❌ Kubernetes, Docker Swarm, Nomad
- ❌ WebSocket real-time (SSE only for now)

---

## Working Style for Claude Code

- **Be concise. No fluff, no over-explanation.** The developer is fast and understands the architecture — assume context.
- **TypeScript only** for application code.
- **Prefer pre-existing offline solutions** (e.g., Lucia for auth, not building from scratch).
- **Mention limitations, costs, trade-offs upfront** before recommending an approach.
- **Always update or create an ADR** in `docs/adr/` when making a significant choice — 2-3 sentences of rationale, named `00X-decision-name.md`.
- **Build order is ops-first:** infrastructure shell before service refactor. Don't rewrite the service layer until Caddy/CoreDNS/Compose/install are working.
- **Match the existing patterns** in the monorepo. If `apps/api` uses Hono, `apps/console` follows a similar style. Consistency over local optimization.

---

## Current Phase

**Networking & DevOps shell** (Weeks 5-7 of project plan):
1. Caddy reverse proxy + subdomain routing
2. CoreDNS for `*.local` resolution (router DNS pointed at host)
3. Docker Compose orchestrating the full stack with placeholders
4. CLI scaffold (init, status, deploy)
5. Health checks across services
6. Milestone: `console.{org}.local` reachable from any LAN device

Service layer (auth/db/storage/deploy) is treated as **placeholders** during this phase. Real services come later.

---

## Defense-Day Constraints

- Bring a pre-configured travel router (controls demo network)
- Demo flow: fresh Ubuntu VM → `curl ... | bash` → console live → create app → deploy frontend → unplug internet → still works → kill container → auto-restart
- Strong defensive sentences are documented in the project plan — code should support these claims (e.g., enforced authz must be centralized, not per-app)
```

---
