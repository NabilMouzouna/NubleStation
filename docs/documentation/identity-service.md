# Identity — Authentication & SSO Service

Identity gives a NubleStation org **cross-platform user accounts** (one identity per human, usable across every app) with **per-app authorization**. It is a Hono service on port 3004, reachable two ways: directly at `identity.{org}.local` (user-facing pages) and through the Gateway at `api.{org}.local/v1/auth/*` (programmatic).

ADR: `docs/adr/014-identity-service.md`

---

## Model in one line

> Register once at `identity.{org}.local`; a session cookie scoped to `.{org}.local` logs you in across every app; an admin grants you a role per app (default-deny).

There are **no browser-side tokens** — authentication is a server-side, revocable session referenced by an `HttpOnly` cookie. This is shared-cookie SSO, deliberately chosen over full OIDC because every app is first-party under one parent domain (see ADR 014 §1).

---

## The two reach paths

```
identity.{org}.local/*        →  Caddy  →  identity:3004     (pages + form posts; sets the cookie)
api.{org}.local/v1/auth/*     →  Caddy  →  gateway  →  identity:3004   (JSON; cookie passed through)
```

The Gateway forwards `/v1/auth/*` **without** requiring an API key, passing the `Cookie` header through and relaying `Set-Cookie` back.

---

## The SSO "login button" flow

```
tasks.{org}.local  ──"Login"──▶  identity.{org}.local/authorize?app=tasks&redirect_uri=http://tasks.{org}.local/
                                       │
                       session cookie on .{org}.local?
                        ├─ no  ▶ render login/register ▶ on success ▼
                        └─ yes ▼
                       role for (user, tasks)?
                        │   admin if user is super_admin/admin, else user_app_access lookup
                        ├─ has role ▶ 302 redirect_uri   (validated: host ends with .{org}.local)
                        └─ none     ▶ "No access" page (default-deny)
                                       │
tasks.{org}.local  ◀──redirect──  app calls GET api.{org}.local/v1/auth/me?app=tasks
                                   ▶ { id, email, displayName, avatarUrl, role }   (403 if no access)
```

`redirect_uri` is **allow-listed**: its host must be `{org}.local` or a `*.{org}.local` subdomain, blocking open redirects.

---

## Routes

### User-facing pages (direct via `identity.{org}.local`)

| Method | Path | Description |
|---|---|---|
| `GET`  | `/login` | Sign-in page (carries `?app` & `?redirect_uri` through the flow) |
| `POST` | `/login` | Verify credentials, create session, set cookie, continue |
| `GET`  | `/register` | Registration page (full name, email, password, optional avatar) |
| `POST` | `/register` | Create account (default-deny), upload avatar, log in |
| `POST` | `/logout` | Revoke session, clear cookie, back to `/login` |
| `GET`  | `/authorize` | SSO grant flow (the login-button target) |
| `GET`  | `/account` | Signed-in landing (avatar, name, sign out) |

### JSON API (via Gateway `api.{org}.local/v1/auth/*`)

| Method | Path | Status | Description |
|---|---|---|---|
| `GET`  | `/v1/auth/me?app={slug}` | 200, 401, 403, 404 | Current user; with `app`, resolves role (403 if none) |
| `POST` | `/v1/auth/logout` | 200 | Revoke session, clear cookie |

### Health probes (no auth)

| Method | Path | Description |
|---|---|---|
| `GET` | `/healthz` | Liveness |
| `GET` | `/readyz`  | Readiness |

---

## Sessions (revocable, server-side)

Backed by `platform.sessions` (`id`, `user_id`, `token_hash`, `expires_at`, `created_at`).

- The cookie carries a **32-byte CSPRNG token**; the DB stores only its **sha256** (`token_hash`). A DB read cannot reconstruct a usable cookie.
- **Revocable**: logout deletes the row; `deleteUserSessions(userId)` force-logs-out a user everywhere.
- **Token rotation on login**: every login mints a fresh token and overwrites the cookie, so a pre-set (fixated) token is never elevated.
- TTL: `SESSION_TTL_HOURS` (default 8).

### Cookie attributes (HTTP-only deployment)

| Attribute | Value | Why |
|---|---|---|
| `HttpOnly` | on | Blocks JS/XSS theft (works over HTTP) |
| `SameSite` | `Lax` | CSRF backstop; `Lax` so the authorize redirect carries the cookie |
| `Domain` | `.{org}.local` | Sent to every app subdomain — the SSO backbone |
| `Secure` | **off for now** | Requires HTTPS; flip via `SECURE_COOKIES=true` once TLS lands |

**Accepted limitation:** without TLS, a same-LAN sniffer could capture the cookie. Resolved when Caddy HTTPS (internal CA) is enabled — only `SECURE_COOKIES` changes.

---

## Authorization

`getUserAppRole(userId, appId)`:

1. If the user's `platform.users.role` is `super_admin` or `admin` → **`admin`** (implicit on every app; no `user_app_access` row).
2. Otherwise → their `platform.user_app_access` role for that app, or **`null`** (default-deny).

Admins are the **grantors**. Console → App → **Users** tab grants/revokes/changes end-user roles (writes `platform.audit_log`).

---

## Avatars

Profile photos are stored in a **reserved system Vault bucket** (app slug `identity-system`, seeded idempotently at boot). On registration Identity HMAC-signs an upload to Vault (as the system app), makes the file public, and stores the URL in `platform.users.avatar_url`. Avatars are therefore cross-app, not scoped to the app a user registered from.

Public avatar URL:
```
http://api.{org}.local/vault/identity-system/avatars/{userId}.{ext}
```

---

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | ✅ | — | Postgres connection string |
| `INTERNAL_HMAC_SECRET` | ✅ | — | Shared HMAC secret (≥32 chars); used to sign Vault calls |
| `ORG_DOMAIN` | | `nuble` | Org domain root; cookie domain is `.{ORG_DOMAIN}.local` |
| `VAULT_INTERNAL_URL` | | `http://vault:3003` | Vault base URL for avatar uploads |
| `IDENTITY_SYSTEM_APP_SLUG` | | `identity-system` | Reserved app owning the avatar bucket |
| `SESSION_TTL_HOURS` | | `8` | Session lifetime |
| `SECURE_COOKIES` | | `false` | Set `true` once HTTPS is available |
| `PORT` | | `3004` | HTTP port |
| `LOG_LEVEL` | | `info` | Pino level |
| `NODE_ENV` | | `development` | `production` disables pretty logs |

---

## Security tests

| Suite | Covers |
|---|---|
| `password.test.ts` | Argon2 hash/verify; malformed hash fails closed |
| `access.test.ts` | Implicit admin-on-all-apps rule; open-redirect allow-listing (external hosts, look-alike suffixes, non-http schemes, malformed URLs all rejected) |

---

## References

- ADR 014 — `docs/adr/014-identity-service.md`
- Platform schema — `docs/documentation/platform-database-schema.md` (`users`, `sessions`, `user_app_access`)
- Vault service — `docs/documentation/vault-service.md` (avatar storage + HMAC pattern)
- Service contract — `docs/documentation/service-contract.md`
