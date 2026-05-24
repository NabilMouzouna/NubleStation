# ADR 010 — HMAC canonical request with signed context headers

**Status:** Accepted  
**Date:** 2026-05-24

---

## Context

The current HMAC signing payload covers four fields:

```
METHOD\nPATH\nBODY_SHA256_HEX\nTIMESTAMP_MS
```

`x-nuble-app-id`, `x-nuble-user-id`, and `x-nuble-app-slug` are forwarded as HTTP headers but are **not part of the signed payload**. A successful HMAC verification proves the Gateway sent the request at a given time with a given body and path — but it does not prove the identity claims in those headers were set by the Gateway.

This matters under a MITM scenario on the Docker bridge network: a compromised container that intercepts an internal forwarded request could swap `x-nuble-app-id` or `x-nuble-app-slug` and re-forward it with a still-valid signature. The body, path, and timestamp are intact, so the verification passes but with falsified tenant identity.

This threat is within the PFE scope. The Docker bridge is private but not physically isolated. A compromised service container shares the same Docker network and can intercept unencrypted bridge traffic.

---

## Decision

Extend the canonical payload with a **signed context block** — the set of trusted identity headers, sorted lexicographically by name and appended after the timestamp. This makes each identity claim cryptographically bound to the request.

### Canonical payload format

```
METHOD\n
PATH\n
BODY_SHA256_HEX\n
TIMESTAMP_MS\n
header-name:value\n
header-name:value\n
...
```

Context headers are always lower-cased, sorted by name (lexicographic, byte order), and each formatted as `header-name:value\n`. This convention is directly modelled on **AWS SigV4's canonical headers** section.

### Context headers included in every request

| Header | Always signed | Signed only when present |
|---|---|---|
| `x-nuble-app-id` | ✅ | |
| `x-nuble-user-id` | ✅ | |
| `x-nuble-app-slug` | | ✅ (Orbit only) |

Because header names are sorted lexicographically, the canonical order is always:

```
x-nuble-app-id:<uuid>
x-nuble-user-id:<uuid>
```

or for Orbit:

```
x-nuble-app-id:<uuid>
x-nuble-app-slug:<slug>
x-nuble-user-id:<uuid>
```

(`app-id` < `app-slug` < `user-id` in byte order)

### Example — Blaze request

```
POST
/v1/blaze/query
a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e
1716134400000
x-nuble-app-id:f47ac10b-58cc-4372-a567-0e02b2c3d479
x-nuble-user-id:b32c1234-1111-2222-3333-444455556666
```

### Example — Orbit deploy request

```
POST
/v1/orbit/deploy
<zip sha256 hex>
1716134400000
x-nuble-app-id:f47ac10b-58cc-4372-a567-0e02b2c3d479
x-nuble-app-slug:tasks
x-nuble-user-id:b32c1234-1111-2222-3333-444455556666
```

---

## Implementation

### `packages/shared/src/hmac.ts`

`computeHmac` gains an optional `context` parameter — a plain object whose entries are sorted and appended. When omitted the payload is byte-identical to the v1 format, so services not yet updated remain compatible during migration.

```typescript
export function computeHmac(
  method: string,
  path: string,
  bodyHashHex: string,
  timestamp: string,
  secret: string,
  context?: Record<string, string>,
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
```

### Gateway — `apps/gateway/src/forward/sign.ts`

`signRequest` accepts an optional `context` and threads it through to `computeHmac`. The proxy always passes at minimum `{ "x-nuble-app-id": appId, "x-nuble-user-id": userId }`.

### Service HMAC middleware

Each service re-constructs the same context object from received headers and passes it to `computeHmac` before comparing. A service that does not use `appSlug` (Blaze, Vault, Identity) simply omits that key from the context — the Gateway never includes it in the signed payload for those services.

---

## Consequences

**Good:**
- Tenant identity is cryptographically bound to every forwarded request — a MITM cannot change `app-id`, `user-id`, or `app-slug` without invalidating the signature.
- The model is standard (SigV4) — any reviewer familiar with AWS internals will recognise the pattern immediately.
- The `context` parameter is optional and defaults to the v1 payload — zero risk of breaking existing tests during migration.
- The sorted-header approach is extensible: adding a new trusted header to a v2 service costs one key in the context object, no format change.

**Trade-off:**
- Both sides must agree on exactly which headers to include. A service that adds an extra header to its context without the Gateway doing the same (or vice versa) will fail HMAC verification. This is a compile-time contract enforced by `@nublestation/shared` exports — not a runtime surprise.

---

## Alternatives considered

**mTLS per service** — rejected. Requires a private CA, cert rotation, and Compose/service-mesh plumbing well beyond the PFE scope.

**Short-lived JWT from Gateway** — viable but heavier. Requires JWT library on every service, clock sync considerations, and a new header scheme. The SigV4 model achieves the same binding with the shared HMAC machinery already in place.

**Signing only `appSlug`** (previous proposal) — insufficient. `appId` and `userId` are equally tamper-worthy under the same threat model.

---

## References

- AWS SigV4 specification — canonical headers: `https://docs.aws.amazon.com/general/latest/gr/sigv4-create-canonical-request.html`
- ADR 003 §14 — signed internal headers (original decision)
- ADR 009 — service plug-and-play contract (invariant 2: no unsigned request accepted)
- `docs/documentation/hmac-signing-flow.md` — implementation walkthrough
- `docs/documentation/service-contract.md` — mandatory checklist for new services
