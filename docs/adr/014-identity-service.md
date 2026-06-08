# ADR 014 — Identity Service (Auth + SSO)

**Status:** Accepted
**Date:** 2026-06-04
**Project:** NubleStation
**Author:** Nabil Mouzouna

---

## Context

NubleStation needs cross-platform user accounts: one identity per human, usable across every app in the org (the "Google account" model), with authorization granted **per app**. Vault, Orbit, and Blaze (schema) are live; `platform.users` and `platform.user_app_access` already exist. **Identity** is the service that lets end-users register, log in once, and be recognized across all `*.{org}.local` apps.

---

## Decisions

### 1. Shared-cookie SSO, not full OIDC

Identity issues a **server-side session** and sets a cookie scoped to `Domain=.{org}.local`, so it is sent to every app subdomain. Apps get the OIDC-style "click to log in" UX by redirecting to `identity.{org}.local/authorize`, but there are **no browser-side tokens**.

**Rationale:** OIDC's machinery (authorization codes, PKCE, token endpoints, JWKS rotation, redirect-URI validation, client secrets) exists to delegate authorization across trust boundaries to *third-party* clients. NubleStation has none — every relying party is first-party under one parent domain. A scoped `HttpOnly` session cookie delivers SSO while **eliminating** OAuth's browser-token attack surface (open redirects, code interception, `localStorage` token theft, JWKS bugs). Real OIDC tokens remain an additive v2 option for programmatic/third-party access (ADR 003 §14 already anticipates "cookie or bearer token").

### 2. Default-deny self-registration; Console admins are implicit app-admins

Anyone on the LAN may self-register (full name, email, password, optional avatar), but a new account has **zero app access**. A Console admin grants an end-user a role on a specific app, recorded in `platform.user_app_access`.

Users whose `platform.users.role` is `super_admin` or `admin` are **implicitly `admin` on every app** — no `user_app_access` row. They are the grantors. Role resolution:

```
getUserAppRole(user, app):
  if user.role in (super_admin, admin) -> "admin"   # implicit, all apps
  else -> user_app_access(user, app).role or null   # default-deny
```

### 3. Revocable server-side sessions (new `platform.sessions` table)

The cookie carries a 32-byte CSPRNG **raw token**; the DB stores only its `sha256` (`token_hash`). A DB read cannot hijack a session. Logout deletes the row; admins force-logout by deleting a user's rows. The token is **rotated on every login** (session-fixation defense). TTL defaults to 8h.

This is stronger than the Console's current stateless HMAC cookie (`apps/console/lib/auth/session.ts`), which cannot be revoked. The Console may adopt the same table later.

### 4. HTTP-only deployment for now (no HTTPS yet)

The stack currently serves plain HTTP on the LAN, so the cookie `Secure` flag cannot be used (`SECURE_COOKIES=false`). We compensate to stay maximally secure:

| Control | State |
|---|---|
| `HttpOnly` | ✅ on (blocks JS/XSS theft — independent of TLS) |
| `SameSite=Lax` | ✅ on (CSRF backstop; `Lax` so the top-level authorize redirect carries the cookie) |
| `Secure` | ❌ off until HTTPS (one-line env flip) |
| `__Host-`/`__Secure-` name prefix | ❌ not usable (requires `Secure`) → plain cookie name |
| Server-side revocation, hashed token, token rotation, short TTL | ✅ on |

**Accepted limitation:** without TLS, a same-LAN attacker who can sniff traffic could capture the session cookie. This is resolved when Caddy HTTPS (internal CA) is enabled; only the `Secure` flag and cookie-name prefix change at that point.

### 5. Avatars in a reserved system Vault bucket

Identity uploads avatars to a reserved system app (`identity-system`, seeded idempotently at boot) via the existing HMAC-to-Vault pattern (`apps/console/lib/internal/vault.ts`), makes them public, and stores the public URL in `platform.users.avatar_url`. Avatars are therefore cross-app (not scoped to whichever app the user registered from), matching the cross-platform identity model.

### 6. Auth UI = Hono server-rendered pages

Login/register/authorize pages are server-rendered (`hono/jsx`) inside the Identity container and styled with the shared design tokens — no separate SPA, no browser-held auth state. Identity is reachable two ways: `identity.{org}.local/*` directly via Caddy (pages + form POSTs), and `api.{org}.local/v1/auth/*` via the Gateway (programmatic `/me`, `/logout`); the Gateway passes the cookie through without requiring an API key.

---

## Consequences

- New table `platform.sessions`; new column `platform.users.avatar_url` (migration `0002`).
- Identity is a new container on port 3004, exposed at `identity.{org}.local` (like Console).
- Gateway gains a `/v1/auth/*` cookie-passthrough route.
- Console's Users tab becomes real (grant/revoke/change role).
- `@nublestation/identity` SDK and gateway-wide `user_id` injection into Blaze/Vault are deferred to follow-ups.
