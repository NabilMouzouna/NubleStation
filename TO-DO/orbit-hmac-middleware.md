# Orbit — HMAC middleware (M5.2)

> Verify gateway-signed requests before any business logic runs. Includes a small extension to `packages/shared/src/hmac.ts` so the signed payload can carry extra fields (the app slug, for Orbit; future fields for Vault, etc.).

## Goal

A Hono middleware that verifies HMAC on every route except `/healthz` and `/readyz`. On success, sets `c.var.appId`, `c.var.appSlug`, `c.var.userId`. On failure, returns a single generic 401.

## Files to touch / create

### Extend the shared library (one source of truth)

`packages/shared/src/hmac.ts`:

```ts
// Before (v1):
computeHmac(method, path, bodyHashHex, timestamp, secret): string

// After (additive, non-breaking):
computeHmac(
  method: string,
  path: string,
  bodyHashHex: string,
  timestamp: string,
  secret: string,
  extraFields?: Record<string, string>,   // ← new optional param
): string
```

**Canonical payload:**

```
METHOD\n
PATH\n
BODY_SHA256_HEX\n
TIMESTAMP
```

When `extraFields` is provided and non-empty:

```
METHOD\n
PATH\n
BODY_SHA256_HEX\n
TIMESTAMP\n
KEY1=VALUE1\n
KEY2=VALUE2     (keys sorted lexicographically, no trailing newline)
```

Critical rule: when `extraFields` is `undefined` or `{}`, the payload is **byte-identical** to v1. This guarantees Blaze's existing signatures still verify without any code change in Blaze.

### Orbit middleware

`apps/orbit/src/middleware/hmac.ts`:

1. Skip on `c.req.path === '/healthz' || c.req.path === '/readyz'`.
2. Read 5 headers: `X-Nuble-App-Id`, `X-Nuble-App-Slug`, `X-Nuble-User-Id`, `X-Nuble-Timestamp`, `X-Nuble-Sig`. Any missing → 401 `missing_signature_headers`.
3. `Math.abs(Date.now() - Number(timestamp)) > 30_000` → 401 `stale_or_invalid_timestamp`.
4. UUID-validate `appId` and `userId`. Slug-pattern-validate `appSlug` (`/^[a-z][a-z0-9-]{0,62}$/`). Either invalid → 400 `invalid_header`.
5. Compute `bodyHash = sha256Hex(await c.req.raw.clone().arrayBuffer())`. (NOTE: this buffers — that's OK for verification; the file extraction itself streams via busboy in [[orbit-upload-route]].)
6. `expected = computeHmac(method, path, bodyHash, timestamp, INTERNAL_HMAC_SECRET, { appSlug })`.
7. `timingSafeEqual(expected, sig)` → 401 `bad_signature` if false.
8. `c.set('appId', appId); c.set('appSlug', appSlug); c.set('userId', userId)`.

### Update `apps/orbit/src/types.ts`

```ts
export type AppVariables = {
  appId: string
  appSlug: string
  userId: string
}
```

Wire into Hono: `new Hono<{ Variables: AppVariables }>()` in `server.ts`.

## Tests

`packages/shared/test/hmac.test.ts` (or extend existing):

- payload with no `extraFields` is byte-identical to v1 — regression guard
- payload with one extra field appends correctly
- payload with multiple fields sorts keys lexicographically
- different `extraFields` produce different signatures

`apps/orbit/test/hmac.test.ts`:

- valid sig (computed with the same secret + slug) → middleware sets c.var and calls next
- tampered sig → 401
- tampered slug (sig doesn't cover the new value) → 401
- stale timestamp (>30s old) → 401
- missing header → 401
- bad UUID → 400

Use Hono's `app.request(url, init)` for in-process testing — no live server needed.

## Acceptance

`pnpm orbit:test` passes. `pnpm blaze:test` still passes (regression guard: Blaze's signatures unchanged).

## Out of scope

- Multipart parsing → [[orbit-upload-route]]
- Body streaming (the verification step still buffers the body for hashing; the file write streams) — documented as a v1.5 optimization (streaming SHA-256 over the request body)

## References

- `apps/blaze/src/middleware/hmac.ts` — copy the structure, swap in the extraFields call
- `docs/adr/007-deployment-service.md` §8 — the payload extension rationale
- `docs/documentation/hmac-signing-flow.md` — the existing trust chain doc
