# ADR 009 — Plug-and-play service contract

**Status:** Accepted  
**Date:** 2026-05-23  
**Project:** NubleStation  
**Authors:** Nabil Mouzouna  
**Reviewers:** —

---

## Context

NubleStation has four v1 services (Gateway, Blaze, Identity, Vault, Orbit) and will gain more in v2. Without a codified contract, each service author could make independent choices about network exposure and authentication, eroding the security model.

The existing Blaze HMAC middleware (`apps/blaze/src/middleware/hmac.ts`) and the signing flow documented in `docs/documentation/hmac-signing-flow.md` are already the right implementation. The decision here is to **lock these patterns as mandatory for every service, forever**.

---

## Decision

Every service in NubleStation — both v1 and future v2 — must satisfy three invariants:

1. **No LAN exposure.** Only Gateway has host-mapped ports. All other services use Docker-internal networking only.

2. **No unsigned request accepted.** Every HTTP route except `/healthz` and `/readyz` must reject requests that do not carry a valid HMAC signature from the Gateway. The implementation is the `hmacAuth` middleware from `@nublestation/shared`; no service may reimplement this logic locally.

3. **Trusted context, not raw headers.** After verification, the service exposes `c.var.appId` and `c.var.userId`. Routes read these variables, never the raw `x-nuble-*` headers directly.

---

## Rationale

- **Network isolation alone is not enough.** A compromised container on the Docker bridge could still forge headers and impersonate any tenant if services accepted unsigned requests. HMAC verification ensures that only the Gateway — which holds `INTERNAL_HMAC_SECRET` — can produce a request a service will accept.
- **Shared package prevents drift.** `computeHmac` and `verifyHmac` live in `packages/shared`. A change to the signing algorithm is one commit that is simultaneously in the signer and every verifier. Independent implementations would eventually diverge.
- **Health check exemption is intentional.** Orchestrators (Docker, Compose health checks) probe these endpoints without authentication. Requiring HMAC there would make liveness checks impossible.

---

## Consequences

- Any new service that does not implement this contract is considered incomplete — it must not be merged.
- The `docker-compose.yml` must never add a `ports:` mapping for a non-Gateway service.
- `INTERNAL_HMAC_SECRET` is a required environment variable for every service. A service that starts without it must refuse to start (fail on boot, not on first request).

---

## References

- `docs/documentation/service-contract.md` — the practical checklist for service authors
- `docs/documentation/hmac-signing-flow.md` — end-to-end flow diagram with code
- `packages/shared/src/hmac.ts` — canonical implementation
- `apps/blaze/src/middleware/hmac.ts` — reference middleware
- ADR 003 §14 — original topology decision
