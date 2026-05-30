---
title: HMAC Request Signing
description: How requests are authenticated between Gateway, Console, and internal services.
---

## The problem

Internal services (Blaze, Vault, Orbit, Identity) listen only on the Docker bridge network. Only the Gateway and Console can reach them from the LAN. But Docker network isolation is not a cryptographic guarantee — a compromised app container on the same bridge could send arbitrary HTTP requests to an internal service.

HMAC signing solves this: services only trust requests that carry a valid signature produced by `INTERNAL_HMAC_SECRET`. A compromised container cannot forge that signature without the secret.

---

## The three request paths

NubleStation has three distinct paths through which requests reach internal services:

| Path | Who sends | Auth mechanism | When used |
|---|---|---|---|
| **Authenticated** | SDK / CLI → Gateway → service | API key → HMAC | Normal app developer traffic |
| **Public** | Browser → Gateway → service | None (service checks `is_public`) | Public file serving (Vault only) |
| **Admin** | Console → service (direct) | HMAC (no API key) | Platform admin operations |

---

## Path 1 — Authenticated (SDK / CLI via Gateway)

The standard path. An app developer's request carries an API key; Gateway resolves it, then signs the forwarded request.

### Canonical payload (SigV4-inspired)

```
METHOD\n
PATH\n
BODY_SHA256_HEX\n
TIMESTAMP_MS\n
x-nuble-app-id:<uuid>\n
x-nuble-user-id:<uuid>
```

Context headers are lower-cased and sorted lexicographically — modelled on AWS SigV4. Every identity claim is inside the signed payload, so a MITM on the Docker bridge cannot swap tenant identity without holding the secret.

For Orbit, `x-nuble-app-slug` is also signed (sorted between `app-id` and `user-id`):

```
POST
/v1/orbit/deploy
<zip sha256 hex>
1716134400000
x-nuble-app-id:f47ac10b-58cc-4372-a567-0e02b2c3d479
x-nuble-app-slug:tasks
x-nuble-user-id:b32c1234-1111-2222-3333-444455556666
```

### Headers forwarded to the service

| Header | Value |
|---|---|
| `x-nuble-app-id` | UUID of the authenticated app |
| `x-nuble-user-id` | UUID of the authenticated user |
| `x-nuble-timestamp` | Unix timestamp in milliseconds |
| `x-nuble-sig` | HMAC-SHA256 of the canonical payload, hex-encoded |

### Signing — Gateway side

```typescript
import { computeHmac, sha256Hex } from "@nublestation/shared";

const bodyHash  = sha256Hex(body);
const timestamp = String(Date.now());
const context   = { "x-nuble-app-id": appId, "x-nuble-user-id": userId };
const sig       = computeHmac(method, path, bodyHash, timestamp, secret, context);
```

### Verification — service side

Applied as middleware to all `/v1/*` routes (never on `/healthz` or `/readyz`):

```typescript
// Rebuild the same context the Gateway signed
const context = {
  "x-nuble-app-id":  c.req.header("x-nuble-app-id"),
  "x-nuble-user-id": c.req.header("x-nuble-user-id"),
};
const expected = computeHmac(method, path, bodyHash, timestamp, secret, context);

if (!verifyHmac(expected, sig)) {
  return c.json({ ok: false, error: "bad_signature" }, 401);
}

// Safe to use — HMAC-verified
c.set("appId", appId);
c.set("userId", userId);
```

---

## Path 2 — Public endpoints (no authentication)

Some content needs to be accessible without an API key — for example, a public logo or document that an app has marked world-readable. Vault exposes a `/vault/*` prefix for this.

**How it works:**

1. Browser requests `api.{org}.local/vault/{app_slug}/{collection}/{filename}` — no `Authorization` header.
2. Gateway matches the `/vault/*` prefix, skips API key resolution, and forwards directly to Vault — no signing.
3. Vault receives an unsigned request, looks up the file's `is_public` flag in the database.
   - `is_public = true` → serve the file.
   - `is_public = false` → `403 Forbidden`.

The public prefix is always at the top level (never under `/v1/`). The `hmacAuth` middleware is **not** applied to it. Only `GET` is allowed.

```typescript
const app = new Hono();

// Public — no HMAC, service-side access check
app.get("/vault/:appSlug/:collection/:filename", servePublicFile);

// Authenticated — HMAC required
app.use("/v1/*", hmacAuth);
app.route("/", vaultRoutes);
```

**Currently implemented:** Vault only (`/vault/*`).

---

## Path 3 — Admin trust path (Console direct)

Console is a trusted internal service, not an external client. Admin operations (browse files, delete deployments, manage settings) bypass Gateway entirely — Console signs requests with `INTERNAL_HMAC_SECRET` and calls services directly over the Docker bridge.

**Why not through Gateway?** Gateway resolves `Bearer nbl_…` API keys that are scoped to app developer operations. Routing admin operations through Gateway would require an internal "admin API key", conflating two separate trust domains.

**How it works:**

1. Admin clicks an action in Console (server action or route handler — never a client component).
2. Console calls `forwardSigned()` from `@nublestation/shared` with `INTERNAL_HMAC_SECRET`.
3. The service receives the request, verifies the HMAC — same middleware, same rules as Path 1.
4. The only observable difference: `x-nuble-user-id` carries `"console-admin"` (a sentinel, not a real UUID).

```typescript
// apps/console/lib/internal/vault.ts
import { forwardSigned } from "@nublestation/shared";

export async function adminDeleteFile(appId: string, fileId: string) {
  return forwardSigned({
    upstreamBaseUrl: process.env.VAULT_INTERNAL_URL!,
    method: "DELETE",
    path: `/v1/vault/files/${fileId}`,
    body: new Uint8Array(),
    appId,
    userId: "console-admin",
    hmacSecret: process.env.INTERNAL_HMAC_SECRET!,
    contentType: null,
  });
}
```

Console never exposes `INTERNAL_HMAC_SECRET` to the browser — all calls are server-side only.

---

## Shared package

All signing and verification logic lives in `packages/shared/src/hmac.ts`. Both Gateway and Console import from it to sign; all services import from it to verify. A change to the canonical payload format is a single commit that affects every participant simultaneously — signer and verifier cannot drift.

---

## Security properties

| Property | Mechanism |
|---|---|
| Authenticity | HMAC-SHA256 with `INTERNAL_HMAC_SECRET` — only Gateway and Console hold the secret |
| Integrity | Body hash is part of the signed payload — body tampering breaks the signature |
| Identity binding | `app-id`, `user-id` (and `app-slug` for Orbit) are inside the signed payload — MITM cannot swap tenant identity |
| Replay prevention | Timestamp must be within ±30 s of the service's clock |
| Timing safety | `timingSafeEqual` for HMAC comparison; Argon2id for API key verification |
| Enumeration prevention | Generic 401 for all auth failures — caller cannot distinguish wrong key from bad signature |
| Network isolation | Services have no host-mapped ports — reachable only via Docker bridge |
