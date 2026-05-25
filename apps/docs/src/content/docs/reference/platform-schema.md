---
title: Platform Database Schema
description: Full ERD and table reference for all platform.* tables in PostgreSQL.
---

The `platform` schema holds all NubleStation infrastructure tables. These are shared across tenants and managed exclusively by the platform — app developers never access them directly.

## Entity Relationship Diagram

```
ORGANIZATIONS
  │ id, name, domain, created_at
  │
  ├──< USERS (org_id)
  │      id, email, password_hash, role, created_at
  │
  ├──< APPS (org_id)
  │      id, name, slug, created_at
  │      │
  │      ├──< API_KEYS (app_id)
  │      │      id, key_id, secret_hash, revoked_at, created_at
  │      │
  │      ├──< USER_APP_ACCESS (app_id)
  │      │      id, user_id, role, created_at
  │      │
  │      ├──< APP_TABLES (app_id)
  │      │      id, table_name, created_at
  │      │
  │      ├──< DEPLOYMENTS (app_id)
  │      │      id, version, status, deployed_at, created_at
  │      │
  │      └──< MIGRATIONS (app_id)
  │             id, version, checksum, applied_at, created_at
  │
  ├──< AUDIT_LOG (org_id, app_id, user_id)
  │      id, action, metadata (jsonb), created_at
  │
  └── SCHEMA_VERSION (standalone)
         id, version, checksum, applied_at, created_at
```

## Table reference

### `organizations`

One row per NubleStation install. Holds the clinic's identity.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | Primary key |
| `name` | `text` | Human name, e.g. "Clinic Sidi Youssef" |
| `domain` | `text` | Subdomain root, e.g. "clinic" → `*.clinic.local` |
| `created_at` | `timestamptz` | Install timestamp |

### `users`

Every human who can log in. One identity, many app accesses.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | Primary key |
| `org_id` | `uuid` | FK → organizations |
| `email` | `text` | Unique, used for login |
| `password_hash` | `text` | Argon2id hash |
| `role` | `text` | Platform role: `admin`, `developer`, `user` |
| `created_at` | `timestamptz` | |

### `apps`

Each app the admin creates. Determines a subdomain, a tenant scope, and credentials.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | Primary key — used as `app_id` / tenant discriminator |
| `org_id` | `uuid` | FK → organizations |
| `name` | `text` | Display name |
| `slug` | `text` | Unique — used as subdomain (`tasks` → `tasks.clinic.local`) |
| `created_at` | `timestamptz` | |

### `api_keys`

Developer credentials for SDK and CLI authentication.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | Primary key (used as Phase 1 `user_id` placeholder) |
| `app_id` | `uuid` | FK → apps |
| `key_id` | `text` | **Indexed, plaintext** — used for O(1) gateway lookup |
| `secret_hash` | `text` | Argon2id of the secret — never the plaintext |
| `label` | `text` | Optional human label |
| `revoked_at` | `timestamptz` | Set to revoke; `null` = active |
| `expires_at` | `timestamptz` | Optional expiry; `null` = never |
| `created_at` | `timestamptz` | |

Key format: `nbl_<key_id>.<secret>`. The gateway splits on `.`, looks up `key_id`, verifies `secret` with Argon2.

### `user_app_access`

Authorization matrix: which user can use which app, and with what role.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | Primary key |
| `user_id` | `uuid` | FK → users |
| `app_id` | `uuid` | FK → apps |
| `role` | `text` | App-defined role (e.g., `doctor`, `nurse`, `admin`) |
| `created_at` | `timestamptz` | |

A user not present in this table for an app cannot access that app's data through `tenant_data.users` view.

### `app_tables`

Registry of which custom table names belong to which app. The REST router uses this — never `information_schema`.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | Primary key |
| `app_id` | `uuid` | FK → apps |
| `table_name` | `text` | Physical table name in `tenant_data` schema |
| `created_at` | `timestamptz` | |

Table names are org-wide unique. The first app to claim `tasks` defines its columns. A second app with an incompatible `tasks` schema is rejected.

### `deployments`

Frontend version history per app.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | Primary key |
| `app_id` | `uuid` | FK → apps |
| `version` | `text` | Semver or git SHA |
| `status` | `text` | `deployed`, `rolled_back` |
| `deployed_at` | `timestamptz` | |
| `created_at` | `timestamptz` | |

### `migrations`

Applied developer SQL migration log per app.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | Primary key |
| `app_id` | `uuid` | FK → apps |
| `version` | `text` | Filename, e.g. `001_create_tasks.sql` |
| `checksum` | `text` | SHA-256 of file content — editing an applied migration is refused |
| `applied_at` | `timestamptz` | |
| `created_at` | `timestamptz` | |

### `schema_version`

Tracks NubleStation's **own** platform-schema migrations. Separate from `migrations` (which tracks developer migrations).

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | Primary key |
| `version` | `text` | Platform schema version (e.g., `0.3.0`) |
| `checksum` | `text` | SHA-256 of the migration SQL |
| `applied_at` | `timestamptz` | |
| `created_at` | `timestamptz` | |

Applied at DB service boot, before the service accepts traffic. If this migration fails, the container exits non-zero rather than serving on a half-migrated schema.

### `audit_log`

Append-only compliance trail for sensitive actions.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | Primary key |
| `org_id` | `uuid` | FK → organizations |
| `app_id` | `uuid` | FK → apps (nullable for org-level actions) |
| `user_id` | `uuid` | FK → users (nullable for system actions) |
| `action` | `text` | e.g., `user.login`, `api_key.revoke`, `query.named` |
| `metadata` | `jsonb` | Action-specific details |
| `created_at` | `timestamptz` | |

No `UPDATE` or `DELETE` is permitted on this table. It is written by platform middleware, never by app code.
