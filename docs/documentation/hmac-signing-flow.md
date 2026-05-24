# HMAC Signing Flow — API Gateway → Internal Services

This document describes the end-to-end trust chain from a client request arriving at the API Gateway to an internal service accepting or rejecting the forwarded request. Both sides share `INTERNAL_HMAC_SECRET` (injected via environment variable) and the signing/verification logic in `packages/shared/src/hmac.ts`.

**Design decision:** ADR 010 — HMAC canonical request with signed context headers.  
**Architectural rationale:** ADR 003 §14 — Gateway as sole LAN entry; signed internal headers.

---

## Overview

```
Client                  API Gateway                      Service (e.g. Blaze)
  │                         │                                │
  │  Bearer nbl_<id>.<sec>  │                                │
  │─────────────────────────▶│                                │
  │                         │ 1. parseApiKey()               │
  │                         │ 2. SELECT api_keys WHERE       │
  │                         │    key_id = $1                 │
  │                         │ 3. argon2.verify(hash, secret) │
  │                         │ 4. sha256(body)                │
  │                         │ 5. buildContext({ appId, userId, [appSlug] })
  │                         │ 6. computeHmac(..., context)   │
  │                         │                                │
  │                         │  x-nuble-app-id: <uuid>        │
  │                         │  x-nuble-user-id: <uuid>       │
  │                         │  x-nuble-timestamp: <ms>       │
  │                         │  x-nuble-sig: <hex>            │
  │                         │  [x-nuble-app-slug: <slug>]    │
  │                         │───────────────────────────────▶│
  │                         │                                │ 7. read headers
  │                         │                                │ 8. check timestamp skew
  │                         │                                │ 9. UUID-validate appId
  │                         │                                │10. sha256(body)
  │                         │                                │11. rebuild context
  │                         │                                │12. computeHmac(..., context)
  │                         │                                │13. timingSafeEqual(expected, sig)
  │                         │                                │14. set c.var.appId / userId / [appSlug]
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

## Phase 2 — Gateway: Request Signing (SigV4-inspired)

**Files:**
- `apps/gateway/src/forward/sign.ts` — produces the HMAC signature
- `apps/gateway/src/forward/proxy.ts` — attaches signed headers and forwards
- `packages/shared/src/hmac.ts` — canonical implementation shared with all services

### Why model after AWS SigV4?

SigV4 is the industry standard for signing internal service requests. The core principle: **every claim that affects a request's behavior must be part of the signed payload**. If a header is trusted but not signed, a MITM on the internal network can modify it without breaking the signature.

NubleStation's model applies the same rule: identity headers (`app-id`, `user-id`, and optionally `app-slug`) are included in the canonical payload. A compromised container on the Docker bridge cannot swap tenant identity without also knowing `INTERNAL_HMAC_SECRET`.

### Canonical payload structure

```
METHOD\n
PATH\n
BODY_SHA256_HEX\n
TIMESTAMP_MS\n
header-name:value\n
header-name:value\n
...
```

Context headers are **lower-cased**, **sorted lexicographically by name**, and appended one per line as `header-name:value`. This is the same canonical form AWS SigV4 uses for its "CanonicalHeaders" section.

### Context headers — which services sign which

| Header | Blaze / Vault / Identity | Orbit |
|---|---|---|
| `x-nuble-app-id` | ✅ always | ✅ always |
| `x-nuble-user-id` | ✅ always | ✅ always |
| `x-nuble-app-slug` | — not included | ✅ always |

Because names are sorted, the canonical order is always deterministic:
- `app-id` < `app-slug` < `user-id` (byte order)

### Example — Blaze `POST /v1/blaze/query`

```
POST
/v1/blaze/query
a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e
1716134400000
x-nuble-app-id:f47ac10b-58cc-4372-a567-0e02b2c3d479
x-nuble-user-id:b32c1234-1111-2222-3333-444455556666
```

### Example — Orbit `POST /v1/orbit/deploy`

```
POST
/v1/orbit/deploy
<zip sha256 hex>
1716134400000
x-nuble-app-id:f47ac10b-58cc-4372-a567-0e02b2c3d479
x-nuble-app-slug:tasks
x-nuble-user-id:b32c1234-1111-2222-3333-444455556666
```

### Signing code

```typescript
// packages/shared/src/hmac.ts
export function computeHmac(
  method: string,
  path: string,
  bodyHashHex: string,
  timestamp: string,
  secret: string,
  context?: Record<string, string>,   // signed identity headers
): string {
  let payload = `${method.toUpperCase()}\n${path}\n${bodyHashHex}\n${timestamp}`;
  if (context) {
    const lines = Object.entries(context)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k.toLowerCase()}:${v}`)
      .join("\n");
    payload += `\n${lines}`;
  }
  return createHmac("sha256", secret).update(payload).digest("hex");
}

// apps/gateway/src/forward/sign.ts
export function signRequest(
  method: string,
  path: string,
  body: Uint8Array,
  secret: string,
  context: Record<string, string>,
  now: number = Date.now(),
): SignedHeaders {
  const bodyHash  = sha256Hex(body);
  const timestamp = String(now);
  const signature = computeHmac(method, path, bodyHash, timestamp, secret, context);
  return { bodyHash, timestamp, signature };
}
```

### Headers forwarded to the service

| Header | Value | In signed payload |
|---|---|---|
| `x-nuble-app-id` | `<uuid>` | ✅ |
| `x-nuble-user-id` | `<uuid>` | ✅ |
| `x-nuble-timestamp` | `<unix ms>` | ✅ (part of base payload) |
| `x-nuble-sig` | `<sha256 hex>` | — (this IS the signature) |
| `x-nuble-app-slug` | `<slug>` (Orbit only) | ✅ |

---

## Phase 3 — Service: HMAC Verification Middleware

**Reference implementation:** `apps/orbit/src/middleware/hmac.ts`  
Applied globally to all routes **except** `/healthz` and `/readyz`.

### Verification steps

```typescript
// 1. Read all required headers
const appId     = c.req.header(X_NUBLE_APP_ID);
const userId    = c.req.header(X_NUBLE_USER_ID);
const timestamp = c.req.header(X_NUBLE_TIMESTAMP);
const sig       = c.req.header(X_NUBLE_SIG);
// Orbit also reads: const appSlug = c.req.header(X_NUBLE_APP_SLUG);

// 2. Reject if any required header is missing → 401 missing_signature_headers
if (!appId || !userId || !timestamp || !sig) return reject();

// 3. Timestamp skew check → 401 stale_or_invalid_timestamp
//    Rejects requests older or newer than ±30 seconds
if (Math.abs(Date.now() - Number(timestamp)) > HMAC_MAX_SKEW_MS) return reject();

// 4. UUID-validate appId → 400 invalid_app_id
z.string().uuid().safeParse(appId);

// 5. Rebuild the same context the Gateway signed
const context: Record<string, string> = {
  [X_NUBLE_APP_ID]:  appId,
  [X_NUBLE_USER_ID]: userId,
  // Orbit adds:  [X_NUBLE_APP_SLUG]: appSlug
};

// 6. Re-hash body + recompute expected HMAC
const bodyBytes = new Uint8Array(await c.req.raw.clone().arrayBuffer());
const bodyHash  = sha256Hex(bodyBytes);
const expected  = computeHmac(c.req.method, c.req.path, bodyHash, timestamp, INTERNAL_HMAC_SECRET, context);

// 7. Constant-time comparison → 401 bad_signature
if (!verifyHmac(expected, sig)) return reject();

// 8. Expose trusted values — routes use c.var, never raw headers
c.set("appId",   appId);
c.set("userId",  userId);
// Orbit: c.set("appSlug", appSlug);
```

### Why `timingSafeEqual`

A naive `===` comparison leaks timing information — an attacker can determine how many leading bytes of their forged signature match the real one. `timingSafeEqual` from Node's `crypto` module takes constant time regardless of where bytes diverge, making brute-force guessing infeasible.

### Why clone the request body

Hono's request body stream can only be consumed once. `.clone()` lets the middleware read the bytes for hashing while the original stream remains available to downstream route handlers.

---

## Shared package — single source of truth

`packages/shared/src/hmac.ts` is imported by every service. The canonical payload format, SHA-256 function, HMAC function, and header name constants can **never drift** between the signer and verifier. Any format change is a single commit that affects all sides simultaneously.

```
packages/shared/
  src/
    hmac.ts      computeHmac(), verifyHmac(), sha256Hex()
    headers.ts   header name constants + HMAC_MAX_SKEW_MS
    api-key.ts   parseApiKey(), parseBearerToken()
```

---

## Security properties

| Property | Mechanism |
|---|---|
| Authenticity | HMAC-SHA256 with `INTERNAL_HMAC_SECRET` — only Gateway knows the secret |
| Integrity | Body SHA-256 is part of the signed payload — body tampering breaks the sig |
| Identity binding | `app-id`, `user-id` (and `app-slug` for Orbit) are inside the signed payload — MITM cannot swap tenant identity |
| Replay prevention | Timestamp skew window of ±30 seconds |
| Timing safety | `timingSafeEqual` on HMAC comparison; `argon2.verify` on API key check |
| Enumeration prevention | Gateway returns a single generic 401 for all auth failures |
| Network isolation | Services not exposed on LAN — only reachable via Docker bridge |

---

## Phase 1 limitation: userId is a placeholder

In Phase 1, `X-Nuble-User-Id` is set to `api_keys.id` (the row UUID of the key itself), not a real user session ID. This is documented with a `// Phase 1 placeholder` comment in `apps/gateway/src/routes/proxy.ts`. Real session resolution will be introduced when Identity is built (Phase 2), and the gateway will then resolve session tokens to actual `users.id` UUIDs before forwarding.

---

## References

- ADR 010 — canonical request design and SigV4 rationale
- ADR 003 §14 — Gateway as sole LAN entry; signed internal headers
- ADR 009 — service plug-and-play contract
- `docs/documentation/service-contract.md` — new-service checklist
- AWS SigV4 spec — canonical headers: `https://docs.aws.amazon.com/general/latest/gr/sigv4-create-canonical-request.html`
