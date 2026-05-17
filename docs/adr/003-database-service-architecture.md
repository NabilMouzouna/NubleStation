# ADR 003 — Database Service Architecture

**Status:** Accepted
**Date:** 2026-05-16
**Project:** NubleStation
**Authors:** Nabil Mouzouna
**Reviewers:** —

---

## Context

NubleStation is a self-hosted, plug-and-play BaaS platform for small clinics. The Database Service is the foundation that every other service (Auth, Storage, Functions) depends on, and the primary touchpoint for app developers using the SDK.

This document captures the agreed-upon architecture for the Database Service, including the multi-tenant model, schema-as-code developer experience, RLS-based tenant isolation, query interface, and the escape hatches that allow flexibility without compromising safety.

---

## Table of Contents

1. [Core Decisions Summary](#1-core-decisions-summary)
2. [Why PostgreSQL](#2-why-postgresql)
3. [The Multi-Tenant Model](#3-the-multi-tenant-model)
4. [Schema Design: Two-Layer Approach](#4-schema-design-two-layer-approach)
5. [Row-Level Security (RLS)](#5-row-level-security-rls)
6. [The Developer Experience: Schema-as-Code](#6-the-developer-experience-schema-as-code)
7. [The Two Resource Tiers](#7-the-two-resource-tiers)
8. [Service Architecture (Four Layers)](#8-service-architecture-four-layers)
9. [Query Interface and Wire Protocol](#9-query-interface-and-wire-protocol)
10. [Escape Hatches for Complex Queries](#10-escape-hatches-for-complex-queries)
11. [Migrations and Schema Evolution](#11-migrations-and-schema-evolution)
12. [Deployment Integration (LAN-Native)](#12-deployment-integration-lan-native)
13. [Real-Time Strategy](#13-real-time-strategy)
14. [Cross-Service Integration](#14-cross-service-integration)
15. [Recommended Tech Stack](#15-recommended-tech-stack)
16. [V2 and Future Features](#16-v2-and-future-features)
17. [Honest Trade-offs](#17-honest-trade-offs)
18. [Defense Talking Points](#18-defense-talking-points)
19. [Anticipated Viva Questions](#19-anticipated-viva-questions)
20. [Implementation Order](#20-implementation-order)

---

## 1. Core Decisions Summary

| Decision | Choice | Rationale (one line) |
|---|---|---|
| Database engine | **PostgreSQL 16+** | Only mainstream OSS DB with native RLS |
| Tenancy model | **Row-level with `app_id` + RLS** | Resource-efficient, defense-grade isolation |
| Schema layout | **Two schemas: `platform` + `tenant_data`** | Clean separation, atomic backups |
| Schema definition | **Schema-as-code DSL (Amplify Gen 2 style)** | Type safety, no raw SQL on the wire |
| Wire protocol | **HTTP REST + JSON** | Cacheable, predictable, RLS-friendly |
| Tenant context | **`SET LOCAL app.current_tenant` per transaction** | Bulletproof against connection-pool reuse bugs |
| Developer resources | **Two tiers: built-in (users/files/etc.) + custom** | Standard needs free, custom needs flexible |
| Real-time | **Server-Sent Events (SSE)** in v1 | One-way is enough, simpler than WebSockets |
| Complex queries | **Three escape levels** (computed, named, raw) | Power with governance |
| Custom logic | **Deferred to v2** | Scope discipline; covered by named queries for now |
| GraphQL | **Deferred to v2** | REST + SSE achieves the same DX at lower complexity |

---

## 2. Why PostgreSQL

### The Real Comparison

| Database | RLS support | Verdict |
|---|---|---|
| **PostgreSQL** | Native, mature, used by Supabase | ✅ Chosen |
| MySQL / MariaDB | None (views as workaround) | ❌ Loses the defense story |
| SQLite | None + single-writer bottleneck | ❌ Wrong tool for multi-tenant writes |
| MongoDB | None natively (Atlas-only) | ❌ No SQL means weaker queries |
| SQL Server | Yes, but licensed and heavy | ❌ Closed source, contradicts offline-first |
| CockroachDB / YugabyteDB | Yes, Postgres-compatible | ❌ Built for distributed clusters; overkill |

### The Five Reasons That Decide It

1. **Row-Level Security is built-in.** The entire isolation story rests on RLS. Without it, we'd be back to trusting every developer's `WHERE` clauses.
2. **Schemas as first-class namespaces.** Clean separation between `platform` and `tenant_data` is native, not a workaround.
3. **JSONB.** Relational + flexible JSON in one engine. Kills the "should we add Mongo?" question.
4. **Permissive license.** PostgreSQL License lets us bundle, redistribute, and run offline forever — critical for an on-premises product.
5. **Mature TypeScript ecosystem.** Drizzle, Prisma, pg driver are all tier-1 on Postgres.

### Defense Sentence

> *"PostgreSQL was chosen because Row-Level Security enables database-enforced tenant isolation, schemas provide clean separation between platform and tenant data, JSONB handles flexible app-defined fields without a second database, and its permissive license is essential for an on-premises product that cannot rely on cloud-licensed software."*

---

## 3. The Multi-Tenant Model

### The Three Classic Patterns

| Pattern | Real-world analogy | Isolation | Complexity |
|---|---|---|---|
| Database-per-tenant | Separate filing cabinets | Highest | Highest |
| Schema-per-tenant | One cabinet, one drawer per tenant | Medium | Medium |
| **Row-level (chosen)** | One cabinet, every file tagged | Acceptable with RLS | Lowest |

### Why Row-Level Wins for NubleStation

- Tenants are *apps inside one clinic*, not separate organizations
- A clinic mini-PC cannot run dozens of Postgres instances
- RLS at the database level provides defense-grade isolation without per-tenant infrastructure
- Same pattern Supabase uses to process billions of queries

### The Rule

**Every table in `tenant_data` has an `app_id` column. RLS auto-filters by it. No exceptions.**

---

## 4. Schema Design: Two-Layer Approach

```
Postgres (one instance, one connection pool, one backup)
│
├── schema: platform              [RLS OFF — platform code only]
│   ├── organizations             (single row — the clinic)
│   ├── users                     (every human: admins, devs, end users)
│   ├── apps                      (one row per app the admin creates)
│   ├── api_keys                  (hashed, scoped to one app)
│   ├── user_app_access           (which user can use which app + role)
│   ├── deployments               (frontend versions per app)
│   ├── migrations                (applied SQL migrations log)
│   └── audit_log                 (compliance trail)
│
└── schema: tenant_data           [RLS ON for every table]
    ├── users (VIEW)              (filtered subset of platform.users)
    ├── files (VIEW)              (filtered subset of platform.files)
    ├── notifications (VIEW)      (filtered subset of platform.notifications)
    ├── [app-defined tables]      (tasks, records, invoices, etc.)
    └── ... each with app_id and auto-generated RLS policy
```

### Why One Database, Two Schemas

- **Atomic backups.** One `pg_dump` captures everything consistently.
- **Cross-schema transactions.** Creating an app + seeding tenant data = one transaction.
- **Single connection pool, single process.** Friendly to a clinic mini-PC.
- **Same pattern as Supabase** (`auth.*`, `storage.*`, `public.*`).

### Platform Tables in Detail

#### `organizations`
Single row per install. Holds org name (`nuble`), subdomain root, admin email, install timestamp.

#### `users`
Every human who logs in. One identity, many app accesses. Holds email, hashed password, display name, role, active status. **Cross-app readable** by design (auth needs global lookup).

#### `apps`
Each app the admin creates. Holds UUID, name (used as subdomain), display name, owning developer, creation date.

#### `api_keys`
Credentials a developer uses from the SDK. Stores **only the hash** (Argon2), never plaintext. Linked to one app, with optional label and expiration.

#### `user_app_access`
The authorization matrix. Rows say *"User X can access App Y with role Z"*. Critical for clinic compliance.

#### `deployments`
Frontend versions. Holds app reference, version number, deploy time, file path, deploying user.

#### `migrations`
Applied SQL migration log. Holds app reference, filename, SHA256 checksum, applied timestamp, applying user.

#### `audit_log`
Every sensitive action (login, permission change, query execution at Level 2/3). Append-only.

### Tenant Tables

App developers define their own tables in `tenant_data`. The schema DSL injects `app_id UUID NOT NULL` automatically. RLS policy is auto-generated. The developer never writes raw SQL.

---

## 5. Row-Level Security (RLS)

### Conceptual Model

> *Imagine you walk into a library and show your card at the door. The librarian flips a switch — now every shelf only shows your books. You browse normally, you cannot even see other patrons' books. When you leave, the switch flips back.*

### The Mechanism

1. At table creation: Postgres is told *"only return rows where `app_id` matches a session variable"*
2. On each request: API service runs `SET LOCAL app.current_tenant = '<uuid>'` inside a transaction
3. Every query the developer runs is silently filtered. They cannot see, write, or update outside their tenant.
4. Transaction ends → variable auto-clears → connection safe to reuse

### Auto-Generated RLS Policy (Per Tenant Table)

```sql
ALTER TABLE tenant_data.tasks ADD COLUMN app_id UUID NOT NULL;
CREATE INDEX tasks_app_id_idx ON tenant_data.tasks (app_id);
ALTER TABLE tenant_data.tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON tenant_data.tasks
  USING (app_id = current_setting('app.current_tenant')::uuid)
  WITH CHECK (app_id = current_setting('app.current_tenant')::uuid);
```

- `USING` = which rows can be **read/updated/deleted**
- `WITH CHECK` = what `app_id` new **inserts/updates** must have

Without `WITH CHECK`, a developer could insert rows under another tenant's `app_id`. With it, Postgres refuses.

### Critical Correctness Rule

**Use `SET LOCAL` inside an explicit transaction.** A plain `SET` persists on the connection, leaking tenant context across requests when the connection is returned to the pool. `LOCAL` scopes the variable to the transaction.

```
BEGIN;
SET LOCAL app.current_tenant = 'app-uuid';
SELECT * FROM tenant_data.tasks;  -- RLS auto-applies
COMMIT;  -- variable cleared, connection safe
```

### Missing Tenant Context: Fail Closed (Decided)

If a query reaches a `tenant_data` table **without** `app.current_tenant`
having been set, the RLS predicate `current_setting('app.current_tenant')::uuid`
**raises an error** rather than returning zero rows. This is intentional and
correct: a query with no tenant context is a *bug*, and a loud failure surfaces
it immediately instead of masking it as an empty result. Use the graceful form
`current_setting('app.current_tenant', true)` **only** in the rare places where
a null tenant is a legitimate state — never on the tenant-isolation path.

---

## 6. The Developer Experience: Schema-as-Code

### The Drizzle-Inspired DSL

The developer writes one file in their NubleStation app project:

```typescript
// schema.ts — single source of truth
import { defineSchema, t } from '@nublestation/schema';

export default defineSchema({
  tasks: {
    title: t.string().required(),
    status: t.enum(['pending', 'in_progress', 'done']).default('pending'),
    priority: t.enum(['low', 'medium', 'high']).default('medium'),
    assignee: t.ref('users'),       // FK to built-in users (auto-resolved)
    metadata: t.json(),              // JSONB for flexible fields
    createdAt: t.timestamp().default('now'),
  },
  comments: {
    task: t.ref('tasks', { onDelete: 'cascade' }),
    author: t.ref('users'),
    body: t.string().required(),
  },
});
```

### How It Becomes Three Artifacts

When the developer runs `nuble db push --app tasks`:

1. **SQL migration** generated and run against Postgres (with auto-injected `app_id` and RLS)
2. **RLS policy** auto-attached to each new table
3. **TypeScript types** generated and saved locally (`.nuble/types.ts`) for SDK autocompletion

### Why Not Let the Developer Use Raw Drizzle?

Drizzle is a SQL builder that runs against a Postgres connection. If used in the frontend, the browser would need direct database credentials (catastrophic). The DSL serializes to JSON over HTTP; only the server speaks SQL.

### Why a Custom DSL Instead of Direct Drizzle Schema?

- **Restrict what's possible** (no `pg_*` system functions, no system tables)
- **Add NubleStation-specific concepts** (`t.ref('users')` wires FKs to platform's built-in tables)
- **Serializable as JSON** for the wire protocol
- **Type-safe with TypeScript** at the SDK boundary

The DSL is a thin layer on top of Drizzle internally. Drizzle does the SQL generation; the DSL adds the safety and integration logic.

---

## 7. The Two Resource Tiers

### Tier 1: Built-in Resources (Firestore-style)

Every app gets these for free. The SDK exposes opinionated methods on top.

| Resource | Purpose | Why built-in |
|---|---|---|
| `users` | Authentication identities | Shared with auth service, needed by every app |
| `files` | Storage metadata | Shared with storage service |
| `notifications` | In-app notification queue | Standard need across apps |
| `audit_log` | Append-only compliance trail | Required for clinic environments |

SDK examples:

```typescript
await nuble.users.findBy({ email: 'dr.smith@clinic.local' });
await nuble.users.create({ email, password, role: 'doctor' });
await nuble.notifications.send(userId, 'New lab result available');
await nuble.files.upload(blob, { folder: 'patient-records', access: 'private' });
```

These map to platform schema tables but are exposed to apps through **views in `tenant_data`** that auto-filter by `user_app_access`. The app developer only sees users/files relevant to their app.

### Tier 2: Custom Resources (Amplify Gen 2-style)

Anything app-specific. Defined in `schema.ts`, auto-exposed in the SDK.

```typescript
await nuble.db.tasks.findMany({
  where: { status: 'pending' },
  include: { assignee: true, comments: { include: { author: true } } },
  orderBy: { createdAt: 'desc' },
  limit: 20,
});

await nuble.db.tasks.create({
  title: 'Review chart for John Doe',
  priority: 'high',
  assignee: drSmith.id,
});

await nuble.db.tasks.aggregate({ count: true, where: { status: 'done' } });
```

### Defense Sentence

> *"NubleStation provides two tiers of data access: built-in resources for common cross-app needs like users and files (Firestore-style), and a schema-as-code DSL for app-specific tables (Amplify Gen 2 style). Both compile to the same Postgres backend with RLS-enforced isolation."*

---

## 8. Service Architecture (Four Layers)

Each request from the SDK flows through these layers, in order:

### Layer 1 — REST Router (Public Face)

Auto-generated endpoints per table:

| Method | Endpoint | Action |
|---|---|---|
| GET | `/v1/db/{table}` | List rows (with filter, sort, paginate) |
| GET | `/v1/db/{table}/:id` | Read one row |
| POST | `/v1/db/{table}` | Insert |
| PATCH | `/v1/db/{table}/:id` | Update |
| DELETE | `/v1/db/{table}/:id` | Delete |

No API code written by the developer. The router reads `information_schema.tables` to know what's exposed.

### Layer 2 — Query Validator (Safety Net)

Three jobs:

1. **Whitelist allowed filters** — `status=eq.pending` is valid; `status=raw.DROP TABLE` is not
2. **Prevent SQL injection** by using only parameterized queries
3. **Enforce per-request quotas** — max 1000 rows, max 100 KB body, max 30s execution

### Layer 3 — Query Builder (Translator)

Converts validated REST queries to parameterized SQL via Drizzle internally:

```
GET /v1/db/tasks?status=eq.pending&order=created_at.desc&limit=20

becomes:

SELECT * FROM tenant_data.tasks
WHERE status = $1
ORDER BY created_at DESC
LIMIT 20;
-- params: ['pending']
-- NOTE: RLS adds "AND app_id = current_setting(...)" automatically
```

### Layer 4 — Connection Manager (Tenant Glue)

For every request:

```
1. Acquire connection from pool
2. BEGIN transaction
3. SET LOCAL app.current_tenant = '<uuid>'
4. Run query
5. COMMIT (variable auto-cleared)
6. Return connection to pool
```

This is the most safety-critical layer. Bugs here cause data leaks. Tests must prove cross-tenant isolation explicitly.

---

## 9. Query Interface and Wire Protocol

### REST Filter Syntax

Inspired by PostgREST:

```
?status=eq.pending             status equals 'pending'
?priority=in.high,medium       priority is high or medium
?title=ilike.*urgent*          title contains 'urgent' (case-insensitive)
?created_at=gt.2026-01-01      created after Jan 1
?order=created_at.desc         sort by created_at descending
?limit=20&offset=40            pagination
?select=id,title,status        partial response
```

### SDK Builder (Wraps REST)

```typescript
await nuble.db.tasks
  .where({ status: 'pending' })
  .include({ assignee: true })
  .orderBy({ createdAt: 'desc' })
  .limit(20);
```

The builder compiles to a REST URL. Browser sends it. Server validates, builds SQL, runs in tenant transaction, returns JSON.

### Type Safety

The CLI-generated types make these queries fully typed at compile time:

```typescript
// Autocompletes
nuble.db.tasks.findMany({ where: { status: '...' } });
//                                         ^ 'pending' | 'in_progress' | 'done'
```

---

## 10. Escape Hatches for Complex Queries

For queries the schema DSL can't express directly, three escape levels exist.

### Level 1 — Computed Fields (Fully Safe)

Declarative derived values evaluated by Postgres:

```typescript
defineSchema({
  invoices: {
    amount: t.decimal().required(),
    taxRate: t.decimal().default(0.2),
    total: t.computed.decimal({
      from: ['amount', 'taxRate'],
      expression: 'amount * (1 + taxRate)',
    }),
  },
});
```

Compiles to a Postgres `GENERATED COLUMN`. The DSL validates the expression only references declared columns. No approval needed.

### Level 2 — Named Queries (Reviewed)

For complex aggregations, CTEs, window functions:

```typescript
export const topAssignees = defineQuery({
  name: 'topAssignees',
  params: { limit: t.number().default(10) },
  returns: t.array({ userId: t.string(), taskCount: t.number() }),
  sql: `
    SELECT assignee_id AS "userId", COUNT(*) AS "taskCount"
    FROM tasks
    WHERE app_id = current_setting('app.current_tenant')::uuid
    GROUP BY assignee_id
    ORDER BY "taskCount" DESC
    LIMIT :limit
  `,
});
```

Platform validates the SQL at push time:
- ✅ Must include tenant filter
- ✅ Parameters pre-declared
- ❌ No `pg_*` system functions, no DDL, no cross-schema reads

SDK exposes:
```typescript
const top = await nuble.db.query('topAssignees', { limit: 5 });
```

Every execution logged in `audit_log`.

### Level 3 — Raw SQL (Admin-Approved, Logged)

For truly exceptional cases. Requires `unsafe: true` flag and explicit admin approval in the dashboard before execution is allowed. Every execution captured in `audit_log` with full SQL and parameters.

For v1, **defer Level 3 to v2**. Levels 1 and 2 cover 90%+ of needs.

### Defense Sentence

> *"NubleStation provides three escape levels for queries beyond the schema DSL's expressive power, from safe computed columns to admin-approved raw SQL. This balances developer flexibility with the auditability requirements of healthcare environments."*

---

## 11. Migrations and Schema Evolution

### Migration File Format

Plain SQL files in the developer's project:

```
my-app/
└── migrations/
    ├── 001_create_tasks.sql
    ├── 002_add_priority_column.sql
    └── 003_create_comments.sql
```

Numbered prefix = ordering. SQL inside = standard Postgres syntax (with platform-injected `app_id` and RLS).

### The Migration Runner (Library, Not Just CLI)

Designed as a callable function with multiple entry points:

| Entry point | Caller |
|---|---|
| `nuble db push` CLI | Developer terminal |
| `POST /v1/apps/:id/migrations` | Admin dashboard |
| `runMigrations(appId, files)` | Future deploy service |

All three entry points call the same library function. Never reimplemented.

### Validation Rules

When migrations are pushed, the API validates:

- ✅ Only `CREATE TABLE`, `ALTER TABLE`, `CREATE INDEX`, `CREATE VIEW`
- ❌ No `DROP DATABASE`, `DROP SCHEMA`, `GRANT`, `REVOKE`
- ❌ No references outside `tenant_data` schema
- ❌ No raw `CREATE POLICY` (RLS is platform-managed)
- ✅ Auto-inject `app_id UUID NOT NULL` on every `CREATE TABLE`
- ✅ Auto-generate the RLS policy

Implementation: use `pg-query-parser` (real SQL parser) — never regex SQL.

### Concurrency Control

Postgres **advisory lock** per app prevents two concurrent migration pushes:

```sql
SELECT pg_advisory_xact_lock(hashtext('migrations:' || app_id));
```

This is the standard pattern (Flyway, Liquibase use the same).

### Migrations Table Schema

```
platform.migrations
├── id              UUID PRIMARY KEY
├── app_id          UUID NOT NULL REFERENCES platform.apps(id)
├── filename        TEXT NOT NULL  (e.g., '001_create_tasks.sql')
├── checksum        TEXT NOT NULL  (SHA256 of file content)
├── applied_at      TIMESTAMPTZ DEFAULT NOW()
└── applied_by      UUID REFERENCES platform.users(id)
```

**Checksum** prevents drift: if a developer edits an already-applied migration, the checksum changes and the platform refuses further migrations.

---

## 12. Deployment Integration (LAN-Native)

### The LAN Reality

NubleStation runs on the same network as the developer. There is **no internet hop**, no CI/CD pipeline, no staging environment. The cloud-deploy patterns (Vercel, Amplify) don't apply.

### The Simple Flow

```bash
# Developer pushes schema changes
nuble db push --app tasks      # ~200ms on LAN

# Developer deploys frontend
nuble deploy --app tasks       # ~3s on LAN (depends on bundle size)

# Or both atomically
nuble push --app tasks         # migrations first, then frontend
```

Two HTTP uploads. No orchestration needed. The developer is sitting at the keyboard.

### What This Means for Today's Database Service Work

Only one architectural concern survives from "deployment thinking":

**The migration runner must be a callable library function**, not a CLI-only script. All three current and future entry points (CLI, dashboard, future deploy service) reuse the same function.

Everything else about deployment is YAGNI for v1.

### Defense Sentence

> *"NubleStation deployments are direct LAN uploads — the CLI sends migration SQL and the frontend bundle to the API gateway in two sequential calls, completing in seconds. There is no deploy pipeline because there is no distance for one to bridge."*

---

## 13. Real-Time Strategy

### The v1 Choice: Server-Sent Events (SSE)

| Approach | Complexity | Verdict |
|---|---|---|
| Postgres `LISTEN/NOTIFY` + WebSockets | Medium | Defer to v2 |
| Logical replication slots | High | Out of scope |
| **SSE** | Low | ✅ v1 |
| Client-side polling | Trivial | Fallback if SSE blocked |

### Why SSE Wins for v1

- One-way (server → client) covers 95% of use cases (notifications, data updates)
- Works through standard HTTP, no protocol upgrades
- Auto-reconnects on the client
- Trivial to thread through the existing API gateway
- ~150 lines of server code total

### The Mechanism

```typescript
// SDK
const unsubscribe = nuble.db.tasks.subscribe(
  { where: { status: 'pending' } },
  (event) => console.log(event.type, event.row)
);
```

On the server:
1. SSE endpoint `/v1/db/subscribe?table=tasks&filter=...`
2. Server runs `LISTEN tenant_data_changes` on Postgres
3. Postgres triggers (auto-generated per table) call `NOTIFY` on insert/update/delete
4. Server filters by tenant + subscription filter, pushes JSON to client

---

## 14. Cross-Service Integration

### Database Service ↔ Auth Service

- Auth service writes to `platform.users` and `platform.user_app_access`
- Database service exposes `tenant_data.users` (view) for app developers
- Both services share the same Postgres instance; no network hop

### Database Service ↔ Storage Service

- Storage service writes file metadata to `platform.files`
- Database service exposes `tenant_data.files` (view) for app developers
- File bytes live on disk; database service never touches them

### The S3-like Model for Storage (Confirmed Pattern)

| Layer | What it holds | Lives where |
|---|---|---|
| Bytes | File content | Filesystem: `/var/nuble/files/{app_id}/{file_id}` |
| Metadata | path, mime, size, owner, custom tags | `platform.files` table |
| Access | Public or signed URL with expiry | Storage service generates on request |

This document does not prescribe the storage service's full design; only the database integration is in scope.

### Database Service ↔ API Gateway

- Gateway resolves API key → `app_id` (cached in Redis, fallback to `platform.api_keys`)
- Gateway forwards request to database service with `app_id` in a trusted header
- Database service sets `SET LOCAL app.current_tenant` from that header

---

## 15. Recommended Tech Stack

Avoid building from scratch where battle-tested OSS exists. Recommendations:

### Database Layer

| Component | Recommendation | Why |
|---|---|---|
| Database engine | **PostgreSQL 16** (Docker official image) | Latest LTS, native RLS, JSONB |
| Connection pooler | **PgBouncer** (transaction pooling mode) | Reduces connection overhead; needed for `SET LOCAL` pattern |
| ORM (server-side) | **Drizzle ORM** | TypeScript-native, lighter than Prisma, raw SQL escape hatch |
| Migration runner | **Drizzle Kit** (with custom wrapper) | Already in your stack; wrap it for validation/RLS injection |
| SQL parser (validation) | **`pg-query-parser`** (npm) | Real Postgres parser ported to JS; never regex SQL |

### API Layer

| Component | Recommendation | Why |
|---|---|---|
| Web framework | **Hono** (decided) | Minimal, zero-dep, web-standard `Request`/`Response` → SSE maps cleanly (Phase 5); first-class TS inference into the SDK. Fastify's plugin ecosystem unnecessary for one narrow gateway. |
| Validation | **Zod** | Schema-first, generates TS types, integrates with Drizzle |
| Auto-REST inspiration | Read **PostgREST** source | Don't embed it (Haskell), but its query syntax is the right reference |

### Auth & SSO

| Component | Recommendation | Why |
|---|---|---|
| Session lib | **Lucia v3** | TypeScript-native, lightweight, no vendor lock-in |
| OIDC provider | **`oidc-provider`** (npm) | Battle-tested OIDC server, ~100 lines of integration |
| Password hashing | **`@node-rs/argon2`** or **bcrypt** | Argon2 is the modern recommendation |

### Real-Time

| Component | Recommendation | Why |
|---|---|---|
| SSE library | Built-in to Hono/Fastify | No need for `socket.io` for one-way |
| Postgres listener | **`pg.Client.on('notification')`** | Native node-postgres support |

### Caching & State

| Component | Recommendation | Why |
|---|---|---|
| Cache | **Redis 7** (Docker official) | Sub-millisecond lookups for API keys |
| Redis client | **`ioredis`** | More features and reliability than `node-redis` |

### Storage

| Component | Recommendation | Why |
|---|---|---|
| File storage | **Local filesystem** in v1 | Simplest; mention MinIO as v2 |
| Signed URLs | Build with `jsonwebtoken` | Standard JWT for signed access tokens |
| MIME detection | **`file-type`** (npm) | Magic-byte detection, not just extension |

### Reverse Proxy & DNS

| Component | Recommendation | Why |
|---|---|---|
| Reverse proxy | **Caddy 2** | Already in your stack; auto-HTTPS for LAN |
| DNS | **CoreDNS** only | Already in your stack; mDNS removed (see ADR — DNS decision) |

### Observability (v1 Minimum)

| Component | Recommendation | Why |
|---|---|---|
| Logs | **Pino** | Fastest TS logger, structured JSON |
| Metrics | **Prometheus client** (`prom-client`) | Industry standard; pair with Grafana in v2 |
| Audit log | Your own `platform.audit_log` table | Compliance requirement, simpler than ELK |

### What to **Avoid** Building

| Tempting to build | Use this instead |
|---|---|
| Custom OAuth flow | `oidc-provider` |
| SQL parser with regex | `pg-query-parser` |
| Bespoke connection pooling | PgBouncer + your ORM's pool |
| Hand-rolled JWT verification | `jose` or `jsonwebtoken` |
| Real-time framework | Built-in SSE in Hono/Fastify |
| Schema validator | Zod |
| HTTP client retries/circuit breakers | `undici` (built into Node 18+) |

---

## 16. V2 and Future Features

This section captures explicitly out-of-scope items with their integration path. Each is genuinely useful but adds weeks of work.

### V2.1 — GraphQL Gateway

**What:** A thin GraphQL layer in front of the existing REST API.

**How it integrates:**
- Reads the schema DSL output (same JSON schema)
- Auto-generates GraphQL types and resolvers
- Resolvers call the REST API internally (one tenant transaction per query)
- Subscriptions wire to the existing SSE infrastructure

**Why deferred:**
- Adds DataLoader complexity for N+1 prevention
- Tenant context threading through resolvers is non-trivial
- REST + SSE already covers the DX goals

**Defense sentence:** *"GraphQL is an additive layer in v2, not a rearchitecture. The schema DSL is the source of truth; GraphQL becomes one more output target."*

### V2.2 — Edge Functions (Custom Business Logic)

**What:** Developer-defined TypeScript functions that run server-side.

**How it integrates:**
- Functions deploy with the app bundle (TypeScript files alongside migrations)
- Trusted execution within the API service process (no sandbox needed for v2; clinic deploys trusted apps)
- Two trigger modes:
  - `callable` — invoked from the SDK directly: `nuble.functions.assignTask(args)`
  - `trigger` — runs after database events: `after:create:tasks → sendNotification`

**Why deferred:**
- Named queries (Level 2 escape) cover most custom-logic needs
- Adds significant complexity (function loading, sandboxing decisions, observability)

**V3 option:** Sandboxed JS runtime (Deno permissions, isolates) for untrusted multi-org scenarios.

### V2.3 — Real-Time via Logical Replication

**What:** True low-latency change streams using Postgres logical replication.

**How it integrates:**
- Replaces or augments the trigger-based `LISTEN/NOTIFY` SSE
- Captures every change with row-level deltas
- Useful for inter-clinic federation (v3)

**Why deferred:**
- SSE + `NOTIFY` is fast enough on LAN (sub-100ms)
- Logical replication setup is operationally heavy

### V2.4 — Multi-Environment per App (Dev/Staging/Prod)

**What:** Each app gets multiple environments with separate databases.

**How it integrates:**
- Adds `environment` column to `apps` table
- Each environment has its own `tenant_data.*` tables (suffixed) or separate schema
- SDK config specifies environment

**Why deferred:**
- One developer per app in v1; staging is the developer's laptop
- Adds storage, deployment, and migration complexity

### V2.5 — Git-Based Deployments

**What:** Push to a Git branch → auto-deploy.

**How it integrates:**
- Webhook receiver on the API gateway
- Pulls branch, runs migrations, deploys frontend
- Optional GitHub Actions integration for build-elsewhere-deploy-here

**Why deferred:**
- LAN-native CLI deploy is faster and simpler for one-developer scenarios
- Useful when multiple developers collaborate on one app

### V2.6 — Storage Service Enhancements

**What:**
- Multipart uploads for large files (current limit: ~500 MB)
- Versioning (S3-style)
- Lifecycle policies (auto-delete after N days)
- MinIO backend for S3-compatible API

**Why deferred:**
- v1 covers basic upload/download/signed-URL needs
- Multipart and versioning are well-understood additions

### V2.7 — Admin Dashboard Enhancements

**What:**
- Query browser (Postgres-like UI for app developers)
- Live schema visualization
- Backup scheduling and restore UI
- Per-app analytics

**Why deferred:**
- v1 dashboard covers user/app/permission management
- Browser-based query tools (Drizzle Studio, pgweb) work as workarounds

### V2.8 — Federation Across Clinics

**What:** Multiple clinics share data with explicit consent flows.

**How it integrates:**
- New `federation` schema in `platform`
- Per-clinic API keys with limited cross-clinic scopes
- End-to-end encryption for federated payloads

**Why deferred:**
- Architecturally adjacent to current PFE; explicit project non-goal
- Genuine multi-org problem worth its own design phase

### V2.9 — Local LLM API (Mentioned in Project Context)

Already documented as v2 in the project context. Database integration would expose embeddings storage (pgvector extension) and inference endpoints.

---

## 17. Honest Trade-offs

### What This Architecture Wins

- **Defense-grade tenant isolation** (RLS + `SET LOCAL`)
- **No SQL on the wire** (DSL → JSON → server SQL only)
- **Familiar DX** (matches Supabase, Firebase, Amplify Gen 2 patterns)
- **Single Postgres footprint** (clinic mini-PC friendly)
- **Type safety end-to-end** (schema generates TS types)
- **Genuine escape hatches** with governance
- **LAN-optimized** (no over-engineered deploy pipeline)

### What This Architecture Costs

| Choice | Trade-off |
|---|---|
| Schema DSL on top of Drizzle | Maintenance burden of the DSL layer |
| Row-level isolation | Catastrophic platform bug *could* leak (RLS heavily mitigates) |
| `SET LOCAL` in transactions | Every read is a transaction (microsecond overhead) |
| REST + SSE (no GraphQL) | Nested queries need explicit `include` |
| Custom DSL (not raw Drizzle) | Developer learns NubleStation-specific syntax |
| No edge functions in v1 | Custom logic limited to named queries |
| Single Postgres instance | All apps share Postgres uptime |
| Auto-generated REST | No custom business endpoints without v2 functions |

### Failure Modes and Mitigations

| Failure | Mitigation |
|---|---|
| Redis cache down | Fallback to Postgres for API key resolution (slower but correct) |
| Postgres down | Whole platform down (acceptable on single-host model) |
| RLS bypass via developer SQL | Impossible — developer never executes raw SQL |
| Migration drift between devs | Checksum verification refuses divergent state |
| Connection pool reuse leak | `SET LOCAL` in transaction guarantees reset |
| Quota exhaustion | Per-app limits in validator + Postgres `statement_timeout` |

---

## 18. Defense Talking Points

Curated set of one-sentence defenses for the viva:

1. **On PostgreSQL choice:** *"PostgreSQL was chosen because Row-Level Security enables database-enforced tenant isolation, schemas provide clean separation between platform and tenant data, JSONB handles flexible app-defined fields without a second database, and its permissive license is essential for an on-premises product."*

2. **On multi-tenancy:** *"Tenant isolation is enforced at the database layer using Row-Level Security, not at the application layer. A developer bug in NubleStation cannot leak data across tenants — the database itself rejects unauthorized reads."*

3. **On schema DSL:** *"NubleStation provides two tiers of data access: built-in resources for common cross-app needs (Firestore-style) and a schema-as-code DSL for app-specific tables (Amplify Gen 2 style). Both compile to the same Postgres backend."*

4. **On query architecture:** *"NubleStation evaluated GraphQL but chose REST + SSE for predictable per-route caching, simpler RLS threading through transactions, and lower operational complexity on a single-host deployment. The schema-DSL provides the type-safety benefits typically associated with GraphQL without the runtime complexity."*

5. **On escape hatches:** *"NubleStation provides three escape levels for queries beyond the DSL's expressive power, from safe computed columns to admin-approved raw SQL. This balances developer flexibility with the auditability requirements of healthcare environments."*

6. **On real-time:** *"v1 implements real-time via Server-Sent Events backed by Postgres LISTEN/NOTIFY — a one-way push model that covers 95% of use cases at a fraction of the complexity of WebSockets, with logical replication available as a v2 evolution."*

7. **On deployment:** *"NubleStation deployments are direct LAN uploads — the CLI sends migration SQL and the frontend bundle to the API gateway in two sequential calls. There is no deploy pipeline because there is no distance for one to bridge."*

8. **On safety:** *"Every database operation runs inside an explicit transaction with `SET LOCAL` for tenant context. This guarantees tenant isolation across connection pool reuse — a class of bugs that has caused real-world breaches in multi-tenant platforms."*

---

## 19. Anticipated Viva Questions

**Q: Why not Kubernetes for orchestration?**
A: Single-host doesn't need cluster orchestration. Compose is the correct tool for the deployment unit (one mini-PC per clinic).

**Q: Why not let developers write raw SQL?**
A: Two reasons. RLS protects rows but not the SQL surface — a developer could DOS the database with `pg_sleep`. REST + DSL constrain what's possible. Second, REST gives a stable contract; raw SQL would couple apps to the schema implementation.

**Q: How is this different from PostgREST?**
A: PostgREST is the inspiration. NubleStation adds enforced multi-tenancy (PostgREST doesn't), API-key-scoped access, per-tenant quotas, a managed migration system, and built-in resources.

**Q: What about full-text search, geospatial, etc.?**
A: Postgres supports all of these natively. The query builder can add operators over time. v1 scope: equality, comparison, ordering, pagination. Named queries cover advanced use today.

**Q: What's the performance cost of RLS?**
A: Negligible when `app_id` is indexed. RLS compiles to a normal `WHERE` clause; Postgres optimizes it like any other filter. Supabase runs millions of queries through this pattern.

**Q: Two developers push conflicting migrations — what happens?**
A: Postgres advisory lock per app serializes migration runs. Standard pattern (Flyway, Liquibase use the same).

**Q: What if Redis is down?**
A: API gateway falls back to Postgres for API key resolution. Slower but correct — documented as graceful degradation.

**Q: Can apps run cross-tenant queries (e.g., shared user data)?**
A: Yes, via curated views in `tenant_data` that read from `platform`. Apps see only users with access to their app, never a global list.

**Q: What about backups?**
A: Single `pg_dump` captures all schemas atomically. Filesystem volume captures storage bytes. Both can be scripted into nightly cron — v2 adds dashboard scheduling.

**Q: HTTPS for `*.nuble.local`?**
A: Caddy generates certs via its internal CA. Browsers accept them once the CA root is installed on each device — documented in the install guide.

---

## 20. Implementation Order

The vertical-slice path (recommended): build one resource end to end before scaling outward. This surfaces every architectural gap early.

### Phase 1 — Foundation (Days 1-3)

1. Postgres + Redis + Drizzle scaffolding
2. `platform` schema migrations (organizations, users, apps, api_keys, user_app_access, migrations, audit_log)
3. Connection manager with `SET LOCAL` pattern
4. **Integration test:** Cross-tenant query returns zero rows (prove RLS works)

### Phase 2 — Built-in `users` Resource (Days 4-6)

5. `platform.users` CRUD via internal API
6. `tenant_data.users` view with `user_app_access` filter
7. SDK methods: `nuble.users.findBy()`, `nuble.users.create()`, etc.
8. **Integration test:** App A cannot see App B's users

### Phase 3 — Custom Resources (Days 7-10)

9. Schema DSL parser (Zod-based)
10. Migration generator (DSL → SQL + RLS)
11. Migration runner library (callable from CLI and API)
12. REST router for auto-generated tables
13. Query validator + builder
14. **Integration test:** Developer-defined table works end to end with RLS

### Phase 4 — SDK Polish (Days 11-13)

15. Type generation from schema DSL
16. SDK builder chain (`where`, `orderBy`, `include`, `limit`)
17. Error handling and friendly messages
18. **Integration test:** A real demo app (the clinic tasks app) compiles and runs

### Phase 5 — Real-Time + Escape Hatches (Days 14-16)

19. Trigger auto-generation for `NOTIFY` on tenant tables
20. SSE endpoint and SDK `.subscribe()` method
21. Computed fields (Level 1 escape)
22. Named queries (Level 2 escape)
23. **Integration test:** Subscription updates arrive cross-tab

### Phase 6 — Hardening (Days 17-20)

24. Per-request quotas and timeouts
25. Audit logging for all sensitive ops
26. Connection pool tuning (PgBouncer)
27. Backup script (`pg_dump` + filesystem snapshot)

### Critical First Milestone

**Phase 1, Step 4** — the cross-tenant isolation test. If this passes, your isolation story is real and defensible. Everything after this is execution.

---

## Appendix A: Glossary

| Term | Definition |
|---|---|
| **App** | A logical tenant within NubleStation. Backed by a row in `platform.apps`. Not a running process. |
| **API Key** | Per-app credential used by the SDK. Stored as hash; resolved to `app_id` by the gateway. |
| **DSL** | Domain-Specific Language. NubleStation's schema DSL is a TypeScript-typed superset of Drizzle's schema syntax. |
| **JSONB** | Postgres binary JSON type. Indexable, queryable, faster than `JSON`. |
| **OIDC** | OpenID Connect. Identity protocol on top of OAuth 2.0, used for cross-app SSO. |
| **PFE** | Projet de Fin d'Études (final-year project). |
| **RLS** | Row-Level Security. Postgres feature where the database enforces row-level access policies. |
| **SDK** | Software Development Kit. The TypeScript library app developers use to query NubleStation. |
| **SSE** | Server-Sent Events. One-way HTTP push mechanism for real-time updates. |
| **Tenant** | A unit of isolation. In NubleStation, each `app_id` is a tenant. |
| **`SET LOCAL`** | Postgres command that scopes a session variable to the current transaction. |

---

## Appendix B: Reference Implementations and Inspirations

| Source | What to learn from it |
|---|---|
| **Supabase** | Two-schema layout, RLS patterns, PostgREST integration |
| **PostgREST** | REST filter syntax (`?status=eq.pending`), auto-generated endpoints |
| **AWS Amplify Gen 2** | Schema-as-code DSL, auto-generated SDK with types |
| **Firebase Firestore** | Built-in resource API style (`users.create()`, `users.findBy()`) |
| **Prisma** | `include` syntax for relations, type-safe queries |
| **Drizzle ORM** | TypeScript schema definition, lightweight SQL builder |
| **Lucia v3** | Session management without vendor lock-in |
| **Flyway** | Migration checksumming and ordering |
| **Hasura** | Auto-generated CRUD over Postgres (study, don't use — too heavyweight) |

---

## Changelog

| Date | Author | Change |
|---|---|---|
| 2026-05-16 | Nabil Mouzouna | Initial document accepted |

---

*End of ADR 003.*
