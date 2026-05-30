# ADR 012 — Vault: File Storage Service

**Status:** Accepted
**Date:** 2026-05-30

---

## Context

NubleStation apps need a place to store arbitrary files — patient documents, images, reports. These files must be:

- Scoped per app (tenant isolation)
- Private by default; optionally made public per file
- Accessible via `api.{org}.local` (already exposed — no new surface)
- Stored on the host filesystem (no S3/MinIO — local-only per platform scope)
- Manageable from the Console (admin full access, per-app file type restrictions)

---

## Decisions

### 1. Path-based API over ID-based

Files are addressed by a developer-defined path: `/{collection}/{filename}`. This gives predictable, human-readable URLs that developers control, which aligns with how a clinic developer thinks ("reports/q1.pdf" not "abc123").

Authenticated API path (requires API key): `api.{org}.local/v1/vault/files/{collection}/{filename}`

### 2. Disk layout mirrors the path

```
/var/nuble/storage/
  {app_slug}/
    {collection}/
      {filename}
```

`app_slug` scopes files to the owning app. `collection` is a developer-defined namespace (a folder). `filename` is the actual file name. Path traversal is guarded by slug and collection/filename validation before any filesystem operation.

### 3. No versioning — 409 on duplicate path

If a file already exists at `/{collection}/{filename}` within an app, the upload returns `409 Conflict`. The developer must delete the existing file or use a different name. The filesystem is the source of truth — no shadow copies.

### 4. Public files served through Gateway — no extra exposed surface

Each file has an `is_public` flag (default: `false`). Public files are accessible without authentication at:

```
api.{org}.local/vault/{app_slug}/{collection}/{filename}
```

Gateway adds a `/vault/*` route that does **not** require an API key. It forwards to Vault, which checks `is_public` before serving. Private files accessed without a key return `403`. This keeps Vault fully internal — no new port or subdomain is exposed.

Vault distinguishes the two contexts by route prefix:
- `/v1/vault/*` — authenticated CRUD (from Gateway after API key resolution)
- `/vault/*` — unauthenticated read-only (from Gateway, public-only)

### 5. Console calls Vault directly via HMAC — never through Gateway

Gateway is for **external clients** (SDK, CLI). Console is a trusted internal service and calls Vault (and Orbit for admin operations) directly using HMAC-signed requests, exactly the same contract as inter-service communication. Console already calls Postgres directly — same principle applies here. Routing admin operations through Gateway would require an internal "admin API key", which conflates two separate trust domains.

```
SDK / CLI  →  Gateway  →  Vault      (external developer traffic, API key required)
Console    →  Vault directly (HMAC)  (admin traffic, no API key)
Console    →  Postgres directly       (data reads, existing pattern)
```

Console gets `VAULT_INTERNAL_URL` as an env var (same pattern as Gateway's `ORBIT_INTERNAL_URL`).

### 6. File type restrictions per app

Admins configure an `allowed_extensions` list per app in Console vault settings. An empty list means all types are allowed. Uploads with a disallowed extension return `415 Unsupported Media Type`. Extensions stored lowercase without leading dot (e.g. `["pdf", "jpg", "png"]`).

### 7. File size cap: 50 MB per file, no total quota

Default max per-file upload size is 50 MB (same as Orbit bundles). Admins can override per app in vault settings (`max_file_bytes`). No total storage quota per app in current scope. Uploads exceeding the per-file limit return `413 Payload Too Large`.

### 8. Metadata in Postgres, hard-deleted with the file

File metadata lives in `platform.storage_files`. When a file is deleted (via API or Console), both the filesystem entry and the DB row are removed in the same operation. No soft-delete.

### 9. Console admin has full access — same pattern as Orbit

Admin users can browse, download, upload, toggle public/private, and delete any file across all apps. Console calls Vault directly via HMAC (see §5). No separate admin API key is needed.

### 10. Port: 3003

Blaze is 3001, Orbit is 3002, Vault is 3003.

---

## Schema

```sql
-- Per-app vault configuration
CREATE TABLE platform.vault_settings (
  app_id             uuid    PRIMARY KEY REFERENCES platform.apps(id) ON DELETE CASCADE,
  allowed_extensions text[]  NOT NULL DEFAULT '{}',    -- empty = allow all
  max_file_bytes     bigint  NOT NULL DEFAULT 52428800  -- 50 MB per file
);

-- File metadata
CREATE TABLE platform.storage_files (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id       uuid        NOT NULL REFERENCES platform.apps(id) ON DELETE CASCADE,
  collection   text        NOT NULL,
  filename     text        NOT NULL,
  storage_path text        NOT NULL,  -- absolute path on disk
  mime_type    text,
  size_bytes   bigint,
  is_public    boolean     NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (app_id, collection, filename)
);
```

---

## Architecture

```
Developer SDK / CLI
      │  Authorization: Bearer nbl_...
      ▼
api.{org}.local  (Caddy → Gateway :3000)
      │
      ├── /v1/vault/*   ─── resolve API key ──► Vault :3003   (authenticated CRUD)
      │                     HMAC-signed
      │
      └── /vault/*      ─────────────────────► Vault :3003   (public read, no key)
                                               checks is_public flag

Console (Next.js)
      │
      ├── Postgres directly (data reads)
      │
      └── Vault :3003 directly (HMAC-signed)   (admin CRUD)
```

---

## What needs to change in other services

| Component | Change |
|---|---|
| **Gateway** | Add `"vault"` case in `resolveUpstream`; add `VAULT_INTERNAL_URL` env; add unauthenticated `/vault/*` route forwarding to Vault |
| **docker-compose** | Add `vault` service on port 3003 |
| **Console** | Add `VAULT_INTERNAL_URL` env; vault tab in app detail (file browser, upload, public toggle, settings) |
| **Blaze** | DB migration adding `vault_settings` and `storage_files` tables |

## Consequences

- Vault stays fully internal — zero new exposed ports or subdomains.
- Public files are served through the already-exposed `api.{org}.local` — no Caddyfile changes needed.
- No storage quota enforcement — disk can fill up; out of scope for PFE.
- Console's internal trust model is now explicit: HMAC for service calls, direct pool for DB reads.
