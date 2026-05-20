# ADR 005 — Install-to-Console Flow

**Status:** Accepted
**Date:** 2026-05-20
**Tags:** infra, auth

---

## Context

`install.sh` is the entry point for every NubleStation deployment. It bootstraps the platform before any container starts. After install, the first human interaction is the super admin opening `console.{org}.local`.

This ADR resolves the full flow from `install.sh` to a working console, covering:

1. What `install.sh` collects and does with it
2. Where platform admin identity lives and why
3. Who accesses the console and how
4. How the console stays operational when the service layer is down
5. How services report events to the console

---

## Decisions

### 1. Install inputs

`install.sh` collects three values:

| Input | Used for |
|---|---|
| Org name | Subdomain root — `*.{org}.local`, written to `.env` |
| Super admin email | Seeded into `admin.db` as the first `admin_users` row |
| Super admin password | Argon2-hashed by `install.sh`, hash stored in `admin.db` |

The plaintext password never enters `.env` and never touches a container. It is hashed and written directly to `admin.db` before Docker starts.

---

### 2. Platform admin identity lives in SQLite, not PostgreSQL

**Decision: `admin.db` — a SQLite file at `/var/nuble/admin.db` on the host.**

Console auth reads only from this file. It never touches PostgreSQL for authentication.

**Why not PostgreSQL:**

| Concern | PostgreSQL | SQLite (`admin.db`) |
|---|---|---|
| Exists before Docker starts | No — Postgres is a container | Yes — `install.sh` creates it |
| Console works if Postgres is down | No — auth blocked | Yes — fully independent |
| Super admin locked out during incident | Yes | Never |
| Backup | Part of `pg_dump` | `cp /var/nuble/admin.db backup/` |
| Operational complexity | Shared with app data | Self-contained, one file |

Platform admins are a fundamentally different entity from clinic users and app tenants. They manage the infrastructure — they are not tenants. Keeping them in a separate store reflects this and removes the dependency on the service layer entirely.

**`admin.db` schema:**

```
admin_users
├── id            TEXT PRIMARY KEY
├── email         TEXT UNIQUE NOT NULL
├── password_hash TEXT NOT NULL          (Argon2)
├── role          TEXT NOT NULL          ('super_admin' | 'admin')
└── created_at    INTEGER NOT NULL

admin_sessions
├── id            TEXT PRIMARY KEY
├── admin_id      TEXT NOT NULL REFERENCES admin_users(id)
├── expires_at    INTEGER NOT NULL
└── created_at    INTEGER NOT NULL

infra_events
├── id            TEXT PRIMARY KEY
├── source        TEXT NOT NULL          (service name: 'gateway', 'auth', 'db', ...)
├── event_type    TEXT NOT NULL          (e.g. 'migration.ran', 'key.issued', 'deploy.triggered')
├── payload       TEXT                   (JSON)
└── created_at    INTEGER NOT NULL

platform_audit
├── id            TEXT PRIMARY KEY
├── admin_id      TEXT NOT NULL REFERENCES admin_users(id)
├── action        TEXT NOT NULL          (e.g. 'app.created', 'admin.invited', 'key.revoked')
├── target        TEXT                   (resource id)
└── created_at    INTEGER NOT NULL
```

---

### 3. `admin.db` is a bind mount, not a named volume

```yaml
# docker-compose.yml
services:
  console:
    volumes:
      - /var/nuble/admin.db:/app/admin.db:rw
```

`/var/nuble/admin.db` is a plain file on the host. It exists before any container starts — created by `install.sh`. When the console container is rebuilt or updated, the file is untouched.

`install.sh` installs `sqlite3` CLI if not present (apt-get), then creates and seeds the file:

```bash
if ! command -v sqlite3 >/dev/null 2>&1; then
    info "Installing sqlite3..."
    sudo apt-get install -y sqlite3
fi

mkdir -p /var/nuble
sqlite3 /var/nuble/admin.db < "$SCRIPT_DIR/seed-admin.sql"
# seed-admin.sql: creates schema + inserts super admin row with hashed password
```

The console runs its own SQLite schema migrations on boot (same pattern as ADR 003 platform migrations) to handle schema evolution across NubleStation updates.

---

### 4. Console auth is separate from app SSO

The console and app SSO serve different audiences and must be fully independent.

| | App SSO (`oidc-provider`) | Console auth |
|---|---|---|
| Audience | Clinic staff using apps | Platform admins managing infra |
| Identity store | `platform.users` (PostgreSQL) | `admin_users` (SQLite) |
| Token type | OIDC ID token + access token | Lucia session cookie |
| Login endpoint | `/auth/login` | `console.{org}.local/login` |
| Depends on Postgres | Yes | Never |

A broken OIDC config, a crashed auth service, or a corrupted `platform.users` table does not affect console access. The super admin can always log in.

---

### 5. Who accesses the console

| Role | Access | Scope |
|---|---|---|
| `super_admin` | Full | All apps, all users, all infra settings, all logs |
| `admin` | Granted by super admin | Defined per invite — can be scoped to specific apps |

Admins are invited by the super admin adding their email to `admin_users` directly in the console UI (no SMTP, no email sent — the super admin shares the login link manually). There is no self-signup.

---

### 6. Two-layer observability

The console has visibility into the service layer through two independent channels:

**Layer A — Docker polling (safety net)**
The console reads container state directly from the Docker daemon (via the Docker socket mounted into the console container). This works even when services are completely crashed — Docker always knows the container status, restart count, exit code, and OOM events.

```yaml
services:
  console:
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - /var/nuble/admin.db:/app/admin.db:rw
```

**Layer B — Service event push (detail layer)**
When services are healthy, they push structured events to the console's internal API:

```
POST http://console/internal/events
X-Nuble-Sig: <HMAC of payload, shared secret from .env>

{ "source": "db", "event_type": "migration.ran", "payload": { ... } }
```

The endpoint is HMAC-signed using the same `INTERNAL_HMAC_SECRET` already in `.env` (reusing the signing logic from `shared/`). Services fire-and-forget — no retry, no crash if the console is unreachable. Events are stored in `infra_events`.

When a service crashes, Layer A covers the gap. When services are healthy, Layer B provides rich operational context. Together they give the full picture in all states.

---

## The Full Boot Flow

```
install.sh
  ├── Check: Docker, docker compose, sqlite3 (install if missing)
  ├── Prompt: org name → .env
  ├── Prompt: super admin email + password
  │     └── Hash password with Argon2
  │     └── sqlite3 /var/nuble/admin.db < seed-admin.sql
  ├── Generate INTERNAL_HMAC_SECRET → .env
  ├── Generate CoreDNS Corefile from template
  ├── Add /etc/hosts entries
  └── docker compose up -d

Console container (first boot)
  ├── Mount: /var/nuble/admin.db → /app/admin.db
  ├── Mount: /var/run/docker.sock → read-only
  ├── Run SQLite schema migrations (if admin.db schema is outdated)
  └── Start Next.js server

Super admin opens console.{org}.local
  └── /login page
  └── Email + password → Argon2-verify against admin_users
  └── Lucia issues session cookie
  └── Console dashboard loads

Onboarding checklist (first login):
  1. Install Caddy root CA on this device (ADR 004)
  2. Create first app
  3. Issue API key
  4. Invite first developer (optional)
```

---

## Consequences

- `install.sh` must install `sqlite3` CLI (apt-get) if not present and create `/var/nuble/admin.db` before `docker compose up`.
- A `seed-admin.sql` file must be added to `scripts/` — runs schema creation and super admin insert.
- The console container must mount `/var/run/docker.sock` (read-only) and `/var/nuble/admin.db`.
- The console must run SQLite schema migrations on boot before accepting traffic.
- `POST /internal/events` must verify the HMAC signature before writing to `infra_events`. Unsigned requests are dropped silently.
- Services must treat `/internal/events` as fire-and-forget — no retry, no crash on failure.
- The HMAC signing logic lives in `packages/shared/` and is reused by both the gateway→service path and the service→console path.
- `platform_audit` must be written on every mutating console action (app created, admin invited, key revoked, etc.).
