# NubleStation — Plug-and-play service contract

> **Scope:** Every service that runs behind the API Gateway — Blaze, Identity, Vault, Orbit, and any future v2 service — must satisfy this contract in full. No exceptions, no partial implementations.

Decision record: ADR 009. Cryptographic detail of the signing handshake: [`hmac-signing-flow.md`](./hmac-signing-flow.md).

This document has three parts:

1. **The routing contract** — the single request shape (`/v1/{service}/{endpoint}`) and how the Gateway dispatches it. This is what makes the platform plug-and-play.
2. **The security contract** — the three invariants every service must enforce so that routing can be trusted.
3. **The admin trust path** — how Console calls services directly via HMAC, bypassing Gateway, for admin operations.

---

## Core principles

1. **One door for external traffic.** Every developer- and end-user-facing request enters through the **API Gateway** (`api.{org}.local`) — the only service published on the LAN. Internal services listen only on the Docker bridge network.
2. **One path shape.** Every authenticated routed request uses `/v1/{service}/{endpoint}`, where `{service}` is the service **codename** (`orbit`, `blaze`, `vault`, `identity`).
3. **Signed or rejected.** The Gateway signs each forwarded request with `INTERNAL_HMAC_SECRET`. Services never trust an unsigned request on authenticated routes. The secret never leaves the Gateway or Console.
4. **Two client types, same external contract.** REST services (Blaze, Vault, Identity) are consumed from the browser via `@nublestation/sdk`. Orbit is consumed from the terminal via the `nuble` CLI. Same `Bearer nbl_…` credential, same gateway, different payload.
5. **Plug-and-play.** The Gateway dispatches purely on `{service}`, looked up in a registry mapping codename → internal URL. A v2 service is added by registering one entry.
6. **Two trust paths.** External clients (SDK, CLI) go through Gateway with an API key. Console goes directly to services via HMAC as a trusted peer — no API key involved. Services cannot and need not distinguish the two: both paths produce a valid HMAC signature.

---

# Part 1 — The routing contract

## Topology

```mermaid
flowchart LR
    subgraph dev["Developer machine"]
      CLI["nuble CLI"]
    end
    subgraph user["End-user browser"]
      SDK["app + @nublestation/sdk"]
    end

    subgraph lan["LAN — *.{org}.local"]
      GW["API Gateway<br/>api.{org}.local<br/>(only LAN-exposed service)"]

      subgraph internal["Internal Docker network — not LAN-exposed"]
        CONSOLE["Console<br/>console.{org}.local"]
        BLAZE["Blaze<br/>/v1/blaze/*"]
        VAULT["Vault<br/>/v1/vault/*<br/>/vault/* (public)"]
        IDENTITY["Identity<br/>/v1/identity/*"]
        ORBIT["Orbit<br/>/v1/orbit/*"]
      end
    end

    SDK -->|"Bearer nbl_…"| GW
    CLI -->|"Bearer nbl_…"| GW
    GW -->|"HMAC-signed /v1/*"| BLAZE
    GW -->|"HMAC-signed /v1/*"| VAULT
    GW -->|"HMAC-signed /v1/*"| IDENTITY
    GW -->|"HMAC-signed /v1/*"| ORBIT
    GW -->|"no auth /vault/*"| VAULT
    CONSOLE -->|"HMAC-signed (direct)"| VAULT
    CONSOLE -->|"HMAC-signed (direct)"| ORBIT
```

The Gateway is the external trust boundary. Console is an internal trusted peer — it signs requests with the same `INTERNAL_HMAC_SECRET` and calls services directly over the Docker bridge.

## The path contract

| Method(s) | Canonical path | Routed to | Driven by |
|---|---|---|---|
| any | `/v1/blaze/{endpoint}` | Blaze (database) | SDK |
| any | `/v1/vault/{endpoint}` | Vault (storage) | SDK |
| any | `/v1/identity/{endpoint}` | Identity (auth) | SDK |
| `POST` | `/v1/orbit/deploy` | Orbit — receive zip, extract, atomic swap | CLI |
| `POST` | `/v1/orbit/rollback` | Orbit — swap `current/` ↔ `.previous/` | CLI |

**Health endpoints are the one exception.** `GET /healthz` and `GET /readyz` are **not** prefixed and **not** signed — they are probed directly by Caddy / Docker Compose on the internal network, never through the Gateway.

## How the Gateway dispatches a request

```mermaid
sequenceDiagram
    participant C as Client (SDK / CLI)
    participant G as API Gateway
    participant S as Internal service

    C->>G: METHOD /v1/{service}/{endpoint}<br/>Authorization: Bearer nbl_id.secret
    G->>G: service = path segment[1]
    G->>G: baseUrl = REGISTRY[service]  (404 if unknown)
    G->>G: resolve API key → { appId, appSlug }
    G->>G: sign(method, fullPath, bodyHash, ts, secret, [extraFields])
    G->>S: same METHOD + fullPath<br/>X-Nuble-* headers + X-Nuble-Sig
    S->>S: verify HMAC — reject if unsigned/invalid
    S-->>G: response
    G-->>C: response (passed through)
```

```text
1. match  /v1/:service/*
2. service = segment[1]              // "orbit" | "blaze" | "vault" | "identity"
3. baseUrl = REGISTRY[service]       // env-configured internal URL
4. if !baseUrl        → 404 unknown_service
5. resolve API key    → { appId, appSlug }   // 401 on any failure
6. sign(method, fullPath, sha256(body), timestamp, secret, extraFields?)
7. forward to (baseUrl + fullPath) with X-Nuble-* headers
```

The **full path is passed through unchanged** — the HMAC payload includes the path, so signer and verifier must see the exact same string. No rewriting, no stripping.

## The service registry — the plug-and-play seam

The Gateway holds one map from codename to internal URL. It is the only thing that knows which services exist.

| Codename | Path prefix | Internal URL (env var) | Client | Extra signed fields |
|---|---|---|---|---|
| Blaze | `/v1/blaze/*` | `BLAZE_INTERNAL_URL` | SDK | — |
| Vault | `/v1/vault/*` | `VAULT_INTERNAL_URL` | SDK | — |
| Identity | `/v1/identity/*` | `IDENTITY_INTERNAL_URL` | SDK | — |
| Orbit | `/v1/orbit/*` | `ORBIT_INTERNAL_URL` | CLI | `appSlug` |

**Signed context** — all trusted identity headers (`app-id`, `user-id`, and optionally `app-slug` for Orbit) are included in the HMAC payload, sorted lexicographically by name. This is modelled on AWS SigV4's canonical headers: every claim that affects a request's behavior must be part of the signed payload. A MITM on the Docker bridge cannot swap tenant identity without also holding `INTERNAL_HMAC_SECRET`. See ADR 010 and `hmac-signing-flow.md` for the full specification.

## SDK clients vs. the CLI client

| | SDK clients — Blaze / Vault / Identity | CLI client — Orbit |
|---|---|---|
| Runs in | End-user browser (shipped in the app bundle) | Developer terminal |
| Package | `@nublestation/sdk` | `@nublestation/cli` |
| Credential | `Bearer nbl_…` (injected into the bundle by `nuble deploy`) | `Bearer nbl_…` (from `~/.nuble/config`) |
| Typical payload | JSON (REST) | `multipart/form-data` zip upload |
| Purpose | Read/write app data at runtime | Ship the frontend itself |
| Signed extras | none | `appSlug` |

```mermaid
sequenceDiagram
    autonumber
    participant App as Browser app (SDK)
    participant G as API Gateway
    participant Blaze as Blaze

    App->>G: POST /v1/blaze/query<br/>Bearer key + JSON
    G->>Blaze: signed forward (no extra fields)
    Blaze-->>G: 200 rows
    G-->>App: 200 rows
```

```mermaid
sequenceDiagram
    autonumber
    participant CLI as nuble CLI
    participant G as API Gateway
    participant Orbit as Orbit
    participant FS as /var/nuble/apps

    CLI->>G: POST /v1/orbit/deploy<br/>Bearer key + zip
    G->>Orbit: signed forward (+ appSlug)
    Orbit->>Orbit: verify HMAC (slug is inside the signature)
    Orbit->>FS: stream-extract → atomic swap
    Orbit-->>G: 200 { ok, slug }
    G-->>CLI: 200 { ok, slug, url }
```

## Public endpoints — unauthenticated read-only

Some services expose a secondary, unauthenticated path prefix for content that has been explicitly marked public. This is an **exception** to the standard routing contract — use it only when content genuinely needs to be accessible without an API key (e.g. public files in Vault).

**Rules:**

- The public prefix is **never** under `/v1/` — it lives at the top level (e.g. `/vault/*`).
- Only `GET` requests are allowed on the public prefix. Writes always require authentication.
- The Gateway forwards these requests to the service **without** resolving an API key and **without** signing them. The service receives a plain, unsigned request.
- The service must **not** apply `hmacAuth` on the public prefix. It enforces its own access check (e.g. `is_public = true` in the database) and returns `403` if the check fails.
- The public prefix must be registered in the Gateway separately from the service registry — it is not part of the authenticated `/v1/*` dispatch.

**Currently implemented:** Vault only.

| Public URL | Forwarded to | Service-side check |
|---|---|---|
| `api.{org}.local/vault/{app_slug}/{collection}/{filename}` | `vault:3003/vault/...` | `storage_files.is_public = true` |

**Server layout inside the service:**

```typescript
const app = new Hono();

// Health — no auth
app.get("/healthz", (c) => c.json({ ok: true }));

// Public read — no HMAC, service-side is_public check
app.get("/vault/:appSlug/:collection/:filename", servePublicFile);

// Authenticated CRUD — HMAC required
app.use("/v1/*", hmacAuth);
app.route("/", vaultRoutes);
```

**Gateway dispatch for the public prefix:**

```text
1. match  /vault/:appSlug/:collection/:filename
2. forward GET to (VAULT_INTERNAL_URL + path)  — no API key resolution, no signing
3. pass response through unchanged
```

A service that wants a public prefix must add it to both the Gateway routing table and its own server before the `hmacAuth` middleware registration.

---

# Part 2 — The security contract (the three invariants)

## 1. No LAN exposure

Services are never reachable from the LAN. Only **Gateway** has host-mapped ports.

```yaml
# infra/docker-compose.yml
services:
  gateway:
    ports:
      - "80:3000"   # exposed on the LAN via Caddy

  blaze:            # no `ports:` — Docker-internal only
    expose:
      - "3001"

  identity:         # no `ports:` — Docker-internal only
    expose:
      - "3002"
```

`expose:` makes the port reachable only to other containers on the same Docker network. `ports:` maps to the host and therefore the LAN. A service that adds a `ports:` entry breaks this contract.

## 2. No unsigned request accepted

Every HTTP route except `/healthz` and `/readyz` must run the `hmacAuth` middleware before any handler logic executes. A request without a valid Gateway signature is rejected with `401` before it touches business logic.

```typescript
import { Hono } from "hono";
import { hmacAuth } from "./middleware/hmac.js";

const app = new Hono();

// Health probes — no auth required by orchestrators
app.get("/healthz", (c) => c.json({ ok: true }));
app.get("/readyz", (c) => c.json({ ok: true }));

// Everything else — HMAC required
app.use("/v1/*", hmacAuth);
app.route("/", myRoutes);
```

The middleware must be registered **before** any authenticated route. Registering it on only some routes is not acceptable.

## 3. Trusted context, not raw headers

After `hmacAuth` passes, the service has trusted values on the Hono context. Routes read these, never the raw headers.

| Variable | Type | Source |
|---|---|---|
| `c.var.appId` | `string` (UUID) | Extracted and verified by `hmacAuth` |
| `c.var.userId` | `string` (UUID) | Extracted and verified by `hmacAuth` |
| `c.var.appSlug` | `string` (kebab) | Orbit only — verified from the signed `appSlug` extra field |

```typescript
// CORRECT
app.post("/v1/orbit/deploy", (c) => {
  const slug = c.var.appSlug;   // safe — verified by hmacAuth
});

// WRONG — bypasses the trust boundary
app.post("/v1/orbit/deploy", (c) => {
  const slug = c.req.header("x-nuble-app-slug");  // never do this
});
```

---

## The HMAC middleware

Every service gets its own copy of the middleware file, but the logic is always imported from `@nublestation/shared` — never reimplemented locally.

```typescript
// apps/<service>/src/middleware/hmac.ts
import type { MiddlewareHandler } from "hono";
import { z } from "zod";
import {
  HMAC_MAX_SKEW_MS,
  X_NUBLE_APP_ID,
  X_NUBLE_SIG,
  X_NUBLE_TIMESTAMP,
  X_NUBLE_USER_ID,
  computeHmac,
  sha256Hex,
  verifyHmac,
} from "@nublestation/shared";
import { loadConfig } from "../config.js";
import type { HonoVariables } from "../types.js";

const uuidSchema = z.string().uuid();

export const hmacAuth: MiddlewareHandler<{ Variables: HonoVariables }> = async (c, next) => {
  const cfg = loadConfig();
  const appId     = c.req.header(X_NUBLE_APP_ID);
  const userId    = c.req.header(X_NUBLE_USER_ID);
  const timestamp = c.req.header(X_NUBLE_TIMESTAMP);
  const sig       = c.req.header(X_NUBLE_SIG);

  if (!appId || !userId || !timestamp || !sig) {
    return c.json({ ok: false, error: "missing_signature_headers" }, 401);
  }

  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > HMAC_MAX_SKEW_MS) {
    return c.json({ ok: false, error: "stale_or_invalid_timestamp" }, 401);
  }

  if (!uuidSchema.safeParse(appId).success) {
    return c.json({ ok: false, error: "invalid_app_id" }, 400);
  }

  const bodyBytes = new Uint8Array(await c.req.raw.clone().arrayBuffer());
  const bodyHash  = sha256Hex(bodyBytes);

  // Rebuild the same context the Gateway signed — must match exactly
  const context: Record<string, string> = {
    [X_NUBLE_APP_ID]:  appId,
    [X_NUBLE_USER_ID]: userId,
    // Services that use appSlug (e.g. Orbit) add it here:
    // [X_NUBLE_APP_SLUG]: appSlug,
  };

  const expected = computeHmac(
    c.req.method,
    c.req.path,
    bodyHash,
    timestamp,
    cfg.INTERNAL_HMAC_SECRET,
    context,
  );

  if (!verifyHmac(expected, sig)) {
    return c.json({ ok: false, error: "bad_signature" }, 401);
  }

  c.set("appId", appId);
  c.set("userId", userId);
  await next();
};
```

The reference implementation lives in `apps/blaze/src/middleware/hmac.ts`. When scaffolding a new service, copy it. The only thing that changes is the import path of `loadConfig` and `HonoVariables`.

**Services that consume extra signed fields** (Orbit's `appSlug`) read the corresponding header, validate its format, and pass it as `extraFields` to `computeHmac` so the recomputed signature matches the Gateway's. They then expose it as `c.var.appSlug`.

## Signed headers reference

| Header | Value | Verified by middleware |
|---|---|---|
| `x-nuble-app-id` | UUID of the tenant (app) | UUID format + HMAC |
| `x-nuble-user-id` | UUID of the user or session | presence only in Phase 1 |
| `x-nuble-app-slug` | kebab-case app slug (Orbit only) | format + HMAC (signed extra field) |
| `x-nuble-timestamp` | Unix timestamp in ms (string) | skew ≤ 30 s |
| `x-nuble-sig` | HMAC-SHA256 hex of canonical payload | `timingSafeEqual` |

**Canonical payload signed by the Gateway (SigV4-inspired):**

```
METHOD\n
PATH\n
BODY_SHA256_HEX\n
TIMESTAMP_MS\n
header-name:value\n
header-name:value\n
...
```

Context headers are lower-cased and sorted lexicographically by name. Blaze / Vault / Identity sign `app-id` and `user-id`. Orbit also signs `app-slug` (sorted between the two):

```
POST
/v1/orbit/deploy
<body sha256 hex>
1716134400000
x-nuble-app-id:f47ac10b-58cc-4372-a567-0e02b2c3d479
x-nuble-app-slug:tasks
x-nuble-user-id:b32c1234-1111-2222-3333-444455556666
```

All constants live in `packages/shared/src/headers.ts`. Do not hardcode header names in service code.

## Environment variable requirement

Every service must declare `INTERNAL_HMAC_SECRET` as a required variable. If it is absent at boot, the service must refuse to start:

```typescript
// apps/<service>/src/config.ts
import { z } from "zod";

const schema = z.object({
  INTERNAL_HMAC_SECRET: z.string().min(32),
  // ... other vars
});

export function loadConfig() {
  return schema.parse(process.env);
}
```

If the secret is missing, `schema.parse` throws at boot time, preventing a service from silently accepting requests with an undefined secret.

## Error response format

All middleware rejections use the same shape: `{ "ok": false, "error": "<code>" }`.

| Condition | Status | Error code |
|---|---|---|
| Any required header missing | 401 | `missing_signature_headers` |
| Timestamp skew > 30 s or non-numeric | 401 | `stale_or_invalid_timestamp` |
| `app-id` is not a valid UUID | 400 | `invalid_app_id` |
| HMAC does not match | 401 | `bad_signature` |

The generic messages are intentional — the caller cannot tell "wrong secret" from "tampered body" from "replayed request".

---

## New-service checklist

When scaffolding a new service:

- [ ] No `ports:` mapping in `docker-compose.yml` — `expose:` only
- [ ] `INTERNAL_HMAC_SECRET` required in config schema; service refuses to boot without it
- [ ] `/healthz` and `/readyz` registered **before** the `hmacAuth` middleware
- [ ] `hmacAuth` registered on `/v1/*` **before** any business routes
- [ ] Routes read `c.var.appId` / `c.var.userId` (and `c.var.appSlug` if applicable), never raw headers
- [ ] `hmac.ts` imports only from `@nublestation/shared`; no local HMAC reimplementation
- [ ] `HonoVariables` declares the trusted context fields
- [ ] **Registered in the Gateway service registry** (`{CODENAME}_INTERNAL_URL` + map entry)
- [ ] Routes mounted under the canonical `/v1/{codename}/*` prefix
- [ ] **If service has public endpoints:** public prefix registered in Gateway separately; `hmacAuth` is NOT applied to the public prefix; service enforces its own access check (e.g. `is_public` flag)
- [ ] **If service is admin-managed from Console:** `{CODENAME}_INTERNAL_URL` added to Console's env in docker-compose

## Adding a service in v2 (the payoff)

A new service — say a `Pulse` metrics service at `/v1/pulse/*` — is added in three steps, none touching the Gateway's core logic:

1. **Build the container** under `apps/pulse/`, reusing the standard `hmacAuth` middleware. It listens only on the internal network and exposes `/healthz` + `/readyz`.
2. **Register it** in the Gateway: add `PULSE_INTERNAL_URL` to config and one entry to the service registry map.
3. **Expose it to clients**: a `nuble.pulse.*` SDK module if it is developer-facing REST, or a `nuble` CLI subcommand if it is an ops tool. Add the Compose service definition.

No new authentication model, no Gateway rewrite, no per-service CORS. The contract absorbs the new service.

## What the Gateway does (for context)

Gateway is the only service that speaks to clients. It:

1. Parses `Authorization: Bearer nbl_<id>.<secret>` from the client.
2. Looks up the API key in `platform.api_keys` (Redis cache, then Postgres).
3. Verifies the Argon2id hash.
4. Resolves `app_id` (and `app_slug` for Orbit) from the key row.
5. Signs the forwarded request with `INTERNAL_HMAC_SECRET` and attaches the `x-nuble-*` headers.
6. Proxies to the correct internal service over the Docker bridge.

Services never see client API keys or session tokens — only Gateway-signed internal requests.

---

## Security properties

| Property | Mechanism |
|---|---|
| Only Gateway can reach services | Docker bridge network; no host-mapped ports on services |
| Gateway cannot be impersonated | `INTERNAL_HMAC_SECRET` — shared only between Gateway and services |
| Body tampering detected | SHA-256 of body is part of the signed payload |
| Identity binding | `app-id`, `user-id` (and `app-slug` for Orbit) are inside the signed payload — MITM on the Docker bridge cannot swap tenant identity without holding the secret (ADR 010) |
| Replay attacks prevented | Timestamp skew window of ±30 seconds |
| Timing attacks prevented | `timingSafeEqual` for HMAC comparison; `argon2.verify` for the key check |
| Enumeration prevented | Gateway returns a single generic 401 for all auth failures |

---

## Current implementation status

This contract is the **target**. As of M5 (Orbit spine):

- **Canonical going forward:** `/v1/{codename}/{endpoint}` for every service.
- **Legacy exception:** Blaze is currently routed as `/v1/db/*`. It should be renamed to `/v1/blaze/*` to conform, migrating the gateway/Blaze code and the `signRequest` test together.
- **Orbit (this milestone):** `POST /v1/orbit/deploy`, `POST /v1/orbit/rollback`, plus unprefixed `/healthz` and `/readyz`. No database connection in M5 — the `platform.deployments` audit row is written in M8.

---

# Part 3 — The admin trust path (Console → service)

## Why Console bypasses Gateway

Gateway is the external trust boundary for **app developers and end users**. It resolves `Bearer nbl_…` API keys that are issued per app and scoped to tenant data.

Console is the **platform admin** — it manages the platform itself (create apps, browse files, view deployments, manage settings). Routing Console's admin operations through Gateway would require a special "internal admin API key", conflating two separate trust domains and making Gateway responsible for authorising both developer traffic and platform admin traffic.

Instead, Console holds `INTERNAL_HMAC_SECRET` and signs requests directly — the same mechanism Gateway uses. Services cannot and do not need to distinguish a Gateway-signed request from a Console-signed request: both carry a valid HMAC. The distinction only matters at the application design level: Console always sends admin-scoped requests; Gateway always sends app-scoped requests.

## How Console signs a request

Console uses `computeHmac` and `forwardSigned` from `@nublestation/shared`, exactly as Gateway does. The env vars it needs are `INTERNAL_HMAC_SECRET` and the internal URL of each service it calls (`VAULT_INTERNAL_URL`, `ORBIT_INTERNAL_URL`).

```typescript
// apps/console/lib/internal/vault.ts  (example)
import { forwardSigned } from "@nublestation/shared";

export async function adminListFiles(appId: string, appSlug: string) {
  return forwardSigned({
    upstreamBaseUrl: process.env.VAULT_INTERNAL_URL!,
    method: "GET",
    path: `/v1/vault/files`,
    body: new Uint8Array(),
    appId,
    userId: "console-admin",   // sentinel value — no real user UUID for admin calls
    hmacSecret: process.env.INTERNAL_HMAC_SECRET!,
    contentType: null,
  });
}
```

Console is a Next.js server-side app — these calls happen inside **server actions or route handlers**, never in client components. No HMAC secret touches the browser.

## What services receive

From a service's perspective, a Console request looks identical to a Gateway-forwarded request: same `x-nuble-*` headers, same HMAC. The only observable difference is that `x-nuble-user-id` carries the sentinel `"console-admin"` rather than a real user UUID, which the service can use for audit logging.

```mermaid
sequenceDiagram
    participant Admin as Admin browser
    participant C as Console (server action)
    participant V as Vault

    Admin->>C: click "Delete file"
    C->>C: sign request with INTERNAL_HMAC_SECRET
    C->>V: DELETE /v1/vault/files/... (HMAC-signed, direct)
    V->>V: verify HMAC — passes
    V->>V: delete file + DB row
    V-->>C: 200 { ok: true }
    C-->>Admin: updated UI
```

## Rules for Console → service calls

- **Server-side only.** `INTERNAL_HMAC_SECRET` must never be referenced from a client component or passed to the browser.
- **Use `forwardSigned` from `@nublestation/shared`.** Do not reimplement the signing logic in Console code.
- **`userId` must be `"console-admin"`** for platform admin operations with no real user context. Services log it as-is for audit trails.
- **Console only calls services it needs.** Console has `VAULT_INTERNAL_URL` and `ORBIT_INTERNAL_URL`. It does not get Blaze's URL — it talks to Postgres directly via `PLATFORM_DB_URL` for all data reads.
- **No Console-specific routes in services.** Services expose one set of `/v1/*` routes. Console uses the same routes as Gateway would — it just arrives with a different `userId`.

## Environment variables for Console

| Variable | Purpose |
|---|---|
| `INTERNAL_HMAC_SECRET` | Signs outbound requests to internal services |
| `VAULT_INTERNAL_URL` | Direct URL to Vault (e.g. `http://vault:3003`) |
| `ORBIT_INTERNAL_URL` | Direct URL to Orbit (e.g. `http://orbit:3002`) |
| `PLATFORM_DB_URL` | Direct Postgres connection for data reads |

## New-service checklist addition

When a service needs to be manageable from Console, add to the service's Compose definition:

```yaml
# infra/docker-compose.yml
console:
  environment:
    VAULT_INTERNAL_URL: http://vault:3003   # add the new service URL here
```

No changes to the service itself are needed — it already accepts HMAC-signed requests from any caller holding the secret.

---

## References

- [`hmac-signing-flow.md`](./hmac-signing-flow.md) — the signing/verification handshake in detail
- ADR 001 — apps are rows, services are containers
- ADR 003 §14 — Gateway as sole LAN entry; signed internal headers
- ADR 007 — Orbit deployment service; §8 the `appSlug` signed field
- ADR 008 — CLI and SDK architecture; the two client types
- ADR 009 — this contract as a locked decision
- ADR 012 — Vault storage service; public endpoint pattern and Console admin trust path
