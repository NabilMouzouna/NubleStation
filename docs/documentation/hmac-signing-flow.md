# HMAC Signing Flow — API Gateway → DB Service

This document describes the end-to-end trust chain from a client request arriving at the API Gateway to the DB service accepting or rejecting the forwarded request. Both sides share `INTERNAL_HMAC_SECRET` (injected via environment variable) and the signing/verification logic in `packages/shared/src/hmac.ts`.

See ADR 003 §14 for the architectural rationale.

---

## Overview

```
Client                  API Gateway                      DB Service
  │                         │                                │
  │  Bearer nbl_<id>.<sec>  │                                │
  │─────────────────────────▶│                                │
  │                         │ 1. parseApiKey()               │
  │                         │ 2. SELECT api_keys WHERE       │
  │                         │    key_id = $1                 │
  │                         │ 3. argon2.verify(hash, secret) │
  │                         │ 4. sha256(body)                │
  │                         │ 5. computeHmac(...)            │
  │                         │                                │
  │                         │  X-Nuble-App-Id: <uuid>        │
  │                         │  X-Nuble-User-Id: <uuid>       │
  │                         │  X-Nuble-Timestamp: <ms>       │
  │                         │  X-Nuble-Sig: <hex>            │
  │                         │───────────────────────────────▶│
  │                         │                                │ 6. read 4 headers
  │                         │                                │ 7. check timestamp skew
  │                         │                                │ 8. UUID-validate appId
  │                         │                                │ 9. sha256(body)
  │                         │                                │10. computeHmac(...)
  │                         │                                │11. timingSafeEqual(...)
  │                         │                                │12. set c.var.appId/userId
  │◀─────────────────────────────────────────────────────────│
```

---

## Phase 1 — Gateway: Client Authentication

**File:** `apps/gateway/src/auth/api-key.ts`

The client authenticates using an API key in the format:

```
Authorization: Bearer nbl_<key_id>.<secret>
```

- `nbl_` — literal prefix.
- `key_id` — alphanumeric, URL-safe. Stored as plaintext in `platform.api_keys.key_id` with a `UNIQUE INDEX`. Used for O(1) DB lookup.
- `secret` — minimum 16 characters. Never stored; only the Argon2id hash (`secret_hash`) lives in the DB.

**Lookup and verification steps:**

```typescript
// 1. Parse the header
const parsed = parseBearerToken(authHeader);   // → { keyId, secret } | null

// 2. Indexed lookup — never scan full table
SELECT id, app_id, secret_hash, expires_at, revoked_at
FROM platform.api_keys
WHERE key_id = $1

// 3. Revocation + expiry checks
if (row.revoked_at) return null;
if (row.expires_at && new Date(row.expires_at) < new Date()) return null;

// 4. Argon2id verification — constant-time, never leaks timing info
const ok = await argon2Verify(row.secret_hash, parsed.secret);
```

A single generic `401` is returned for any failure — whether `key_id` not found, revoked, expired, or secret mismatch. This prevents enumeration.

---

## Phase 2 — Gateway: Request Signing

**Files:**
- `apps/gateway/src/forward/sign.ts` — produces the HMAC signature
- `apps/gateway/src/forward/proxy.ts` — attaches signed headers and forwards
- `packages/shared/src/hmac.ts` — canonical implementation (shared with DB service)

### Canonical Payload

```
METHOD\nPATH\nBODY_SHA256_HEX\nTIMESTAMP_MS
```

Example for `POST /v1/db/tasks` with a 14-byte body:

```
POST
/v1/db/tasks
a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e
1716134400000
```

### Signing code

```typescript
// apps/gateway/src/forward/sign.ts
export function signRequest(method, path, body: Uint8Array, secret, now = Date.now()) {
  const bodyHash = sha256Hex(body);          // SHA-256 of raw bytes
  const timestamp = String(now);             // Unix ms as string
  const signature = computeHmac(method, path, bodyHash, timestamp, secret);
  return { bodyHash, timestamp, signature };
}

// packages/shared/src/hmac.ts
export function computeHmac(method, path, bodyHashHex, timestamp, secret): string {
  const payload = `${method.toUpperCase()}\n${path}\n${bodyHashHex}\n${timestamp}`;
  return createHmac("sha256", secret).update(payload).digest("hex");
}
```

### Headers sent to DB service

| Header | Value | Purpose |
|---|---|---|
| `x-nuble-app-id` | `<uuid>` | Tenant identifier, resolved from `api_keys.app_id` |
| `x-nuble-user-id` | `<uuid>` | User/session identifier (Phase 1: `api_keys.id` placeholder) |
| `x-nuble-timestamp` | `<unix ms>` | Replay attack prevention |
| `x-nuble-sig` | `<sha256 hex>` | HMAC-SHA256 of canonical payload |

The DB service is **not exposed on the LAN** — it only listens on the internal Docker bridge network. These headers are the sole mechanism the DB service uses to identify and trust requests.

---

## Phase 3 — DB Service: HMAC Verification Middleware

**File:** `apps/db/src/middleware/hmac.ts`

Applied globally to all routes **except** `/healthz` and `/readyz`.

### Verification steps

```typescript
// 1. All 4 headers must be present → 401 missing_signature_headers
const appId     = c.req.header("x-nuble-app-id");
const userId    = c.req.header("x-nuble-user-id");
const timestamp = c.req.header("x-nuble-timestamp");
const sig       = c.req.header("x-nuble-sig");

// 2. Timestamp skew check → 401 stale_or_invalid_timestamp
//    Rejects requests older or newer than ±30 seconds (HMAC_MAX_SKEW_MS = 30_000)
if (Math.abs(Date.now() - Number(timestamp)) > HMAC_MAX_SKEW_MS) reject();

// 3. UUID-validate appId → 400 invalid_app_id
z.string().uuid().safeParse(appId);

// 4. Re-hash body using the same sha256Hex function
const bodyBytes = new Uint8Array(await c.req.raw.clone().arrayBuffer());
const bodyHash  = sha256Hex(bodyBytes);

// 5. Recompute expected HMAC with the shared secret
const expected = computeHmac(c.req.method, c.req.path, bodyHash, timestamp, INTERNAL_HMAC_SECRET);

// 6. Constant-time comparison → 401 bad_signature
if (!verifyHmac(expected, sig)) reject();

// 7. Expose trusted values on Hono context
c.set("appId", appId);   // downstream: c.var.appId
c.set("userId", userId); // downstream: c.var.userId
```

### Why `timingSafeEqual`

A naive `===` comparison leaks timing information — an attacker can determine how many leading bytes of their forged signature match the real one. `timingSafeEqual` from Node's `crypto` module takes constant time regardless of where bytes diverge, making brute-force guessing infeasible.

### Why clone the request body

Hono's request body stream can only be consumed once. `.clone()` lets the middleware read the bytes for hashing while the original stream remains available to downstream route handlers.

---

## Shared package — single source of truth

`packages/shared/src/hmac.ts` is imported by both services. This means the canonical payload format, SHA-256 function, and HMAC function can **never drift** between the signer and verifier. Any change to the format is a single commit that affects both sides simultaneously.

```
packages/shared/
  src/
    hmac.ts       computeHmac(), verifyHmac(), sha256Hex()
    headers.ts    header name constants + HMAC_MAX_SKEW_MS
    api-key.ts    parseApiKey(), parseBearerToken()
```

---

## Security properties

| Property | How it's achieved |
|---|---|
| Authenticity | HMAC-SHA256 with `INTERNAL_HMAC_SECRET` — only gateway knows the secret |
| Integrity | Body hash is part of the signed payload — body tampering breaks the sig |
| Replay prevention | Timestamp must be within ±30 s of DB service clock |
| Timing safety | `timingSafeEqual` on HMAC comparison; `argon2.verify` on API key check |
| Enumeration prevention | Gateway returns a single generic 401 for all auth failures |
| Network isolation | DB service not exposed on LAN — only reachable via Docker bridge |

---

## Phase 1 limitation: userId is a placeholder

In Phase 1, `X-Nuble-User-Id` is set to `api_keys.id` (the row UUID of the key itself), not a real user session ID. This is documented with a `// Phase 1 placeholder` comment in `apps/gateway/src/routes/proxy.ts:18`. Real session resolution will be introduced when the auth service is built (Phase 2), and the gateway will then resolve session tokens to actual `users.id` UUIDs before forwarding.
