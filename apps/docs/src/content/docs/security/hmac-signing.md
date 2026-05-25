---
title: HMAC Request Signing
description: How the API Gateway signs internal requests so services can't be spoofed.
---

## The problem

Internal services (DB, Auth, Storage, Deploy) listen only on the Docker bridge network. Only the API Gateway can reach them. But Docker network isolation isn't a cryptographic guarantee — a compromised app container could potentially send arbitrary HTTP requests to an internal service.

HMAC signing solves this: internal services only trust requests that carry a valid signature produced by `INTERNAL_HMAC_SECRET`, which is known only to the gateway and the target service. A compromised app container cannot forge a signature because it doesn't have the secret.

## The canonical payload

The gateway signs this string:

```
METHOD\nPATH\nBODY_SHA256_HEX\nTIMESTAMP_MS
```

Example for `POST /v1/db/tasks` with a JSON body:

```
POST
/v1/db/tasks
a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e
1716134400000
```

The body hash ensures that tampering with the request body after signing breaks the signature.

## Headers sent to internal services

| Header | Value |
|---|---|
| `x-nuble-app-id` | UUID of the authenticated app |
| `x-nuble-user-id` | UUID of the authenticated user |
| `x-nuble-timestamp` | Unix timestamp in milliseconds |
| `x-nuble-sig` | HMAC-SHA256 of the canonical payload, hex-encoded |

## Signing (gateway side)

```typescript
// packages/shared/src/hmac.ts — shared between gateway and services
export function computeHmac(
  method: string,
  path: string,
  bodyHashHex: string,
  timestamp: string,
  secret: string
): string {
  const payload = `${method.toUpperCase()}\n${path}\n${bodyHashHex}\n${timestamp}`;
  return createHmac('sha256', secret).update(payload).digest('hex');
}

// apps/gateway/src/forward/sign.ts
export function signRequest(method, path, body: Uint8Array, secret, now = Date.now()) {
  const bodyHash = sha256Hex(body);
  const timestamp = String(now);
  const signature = computeHmac(method, path, bodyHash, timestamp, secret);
  return { bodyHash, timestamp, signature };
}
```

## Verification (service side)

Applied as middleware to all routes except `/healthz` and `/readyz`:

```typescript
// apps/db/src/middleware/hmac.ts
const appId     = c.req.header('x-nuble-app-id');
const userId    = c.req.header('x-nuble-user-id');
const timestamp = c.req.header('x-nuble-timestamp');
const sig       = c.req.header('x-nuble-sig');

// Step 1: all headers must be present
if (!appId || !userId || !timestamp || !sig) {
  return c.json({ error: 'missing_signature_headers' }, 401);
}

// Step 2: reject stale requests (±30 seconds)
if (Math.abs(Date.now() - Number(timestamp)) > 30_000) {
  return c.json({ error: 'stale_or_invalid_timestamp' }, 401);
}

// Step 3: validate appId is a UUID
if (!z.string().uuid().safeParse(appId).success) {
  return c.json({ error: 'invalid_app_id' }, 400);
}

// Step 4: re-hash the request body
const bodyBytes = new Uint8Array(await c.req.raw.clone().arrayBuffer());
const bodyHash  = sha256Hex(bodyBytes);

// Step 5: recompute the expected HMAC
const expected = computeHmac(c.req.method, c.req.path, bodyHash, timestamp, INTERNAL_HMAC_SECRET);

// Step 6: constant-time comparison (prevents timing attacks)
if (!timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) {
  return c.json({ error: 'bad_signature' }, 401);
}

// Step 7: expose verified values to downstream handlers
c.set('appId', appId);
c.set('userId', userId);
```

## Shared package

`packages/shared/src/hmac.ts` is imported by both the gateway and all internal services. The canonical payload format, SHA-256 function, and HMAC function live in one place — they cannot drift between the signer and verifier. A format change is a single commit that affects both sides at once.

## Security properties

| Property | How it's achieved |
|---|---|
| **Authenticity** | HMAC-SHA256 with `INTERNAL_HMAC_SECRET` — only the gateway knows the secret |
| **Integrity** | Body hash is part of the signed payload — body tampering breaks the signature |
| **Replay prevention** | Timestamp must be within ±30 s of the service's clock |
| **Timing safety** | `timingSafeEqual` on HMAC comparison; Argon2 on API key verification |
| **Enumeration prevention** | Gateway returns a single generic 401 for all auth failures |
| **Network isolation** | Services aren't exposed on the LAN — reachable only via Docker bridge |

## Why `timingSafeEqual`

A naive `===` string comparison leaks timing information. An attacker measuring response times can determine how many leading bytes of a forged signature match the real one, enabling brute-force attacks byte-by-byte. `timingSafeEqual` from Node's `crypto` module takes constant time regardless of where the bytes diverge.
