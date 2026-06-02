# Vault — File Storage Service

Vault stores arbitrary files for NubleStation apps — documents, images, patient records — on the host filesystem with metadata tracked in Postgres. It is a Hono service on port 3003, never directly exposed on the LAN.

ADR: `docs/adr/012-vault-storage-service.md`

---

## What Vault does

```
SDK / CLI
    │  POST /v1/vault/files/{collection}/{filename}
    ▼
Gateway  ─── resolve API key → app_id, app_slug
    │  HMAC-signed: x-nuble-app-id, x-nuble-user-id
    ▼
Vault :3003
    │
    ├── validate segment names (no path traversal)
    ├── load vault_settings (allowed_extensions, max_file_bytes)
    ├── check extension whitelist
    ├── parse multipart body (busboy)
    ├── detect MIME type from bytes (file-type)
    ├── check for existing file (409 on conflict)
    ├── write bytes to /var/nuble/storage/{slug}/{collection}/{filename}
    └── insert row into platform.storage_files
```

Public file access (no API key):

```
Browser
    │  GET /vault/{app_slug}/{collection}/{filename}
    ▼
Gateway  ─── no API key resolution, no signing
    │
    ▼
Vault :3003  /vault/:appSlug/:collection/:filename
    │
    ├── query storage_files JOIN apps WHERE name = slug
    ├── is_public = false  →  403 Forbidden
    └── is_public = true   →  serve file bytes
```

---

## Routes

### Authenticated (HMAC required — served via Gateway)

| Method | Path | Status codes | Description |
|---|---|---|---|
| `POST` | `/v1/vault/files/:collection/:filename` | 201, 400, 409, 413, 415 | Upload a file |
| `GET` | `/v1/vault/files` | 200 | List all files for the app |
| `GET` | `/v1/vault/files/:collection` | 200 | List files in a collection |
| `GET` | `/v1/vault/files/:collection/:filename` | 200, 404 | Download a file |
| `PATCH` | `/v1/vault/files/:collection/:filename` | 200, 400, 404 | Toggle `is_public` |
| `DELETE` | `/v1/vault/files/:collection/:filename` | 200, 404 | Delete file + metadata |

### Public (no auth — served via Gateway, no signing)

| Method | Path | Status codes | Description |
|---|---|---|---|
| `GET` | `/vault/:appSlug/:collection/:filename` | 200, 403, 404 | Serve a public file |

### Health probes (no auth)

| Method | Path | Description |
|---|---|---|
| `GET` | `/healthz` | Liveness — is the process running? |
| `GET` | `/readyz` | Readiness — same as healthz for now |

---

## Disk layout

```
/var/nuble/storage/
  {app_slug}/
    {collection}/
      {filename}
```

Path segments are validated with `SEGMENT_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/` and explicitly reject `..`. The resolved absolute path is also checked against the storage root to prevent traversal even after segment validation passes.

---

## Database schema

```sql
-- Per-app configuration
platform.vault_settings
  app_id             uuid  PK → platform.apps
  allowed_extensions text[]    DEFAULT '{}'          -- empty = allow all
  max_file_bytes     bigint    DEFAULT 52428800       -- 50 MB per file

-- File metadata
platform.storage_files
  id           uuid  PK
  app_id       uuid  → platform.apps  ON DELETE CASCADE
  collection   text
  filename     text
  storage_path text                                   -- absolute path on disk
  mime_type    text
  size_bytes   bigint
  is_public    boolean  DEFAULT false
  created_at   timestamptz
  UNIQUE (app_id, collection, filename)
```

Metadata and disk file are always deleted together (hard delete). No soft delete.

---

## MIME detection

On upload, `file-type` reads magic bytes from the first chunk of the file and returns the real MIME type regardless of the `Content-Type` header sent by the client. A file named `malware.pdf` that contains a Windows PE header is detected as `application/x-msdownload`, not `application/pdf`. The detected MIME type is stored in `storage_files.mime_type` and returned in the `Content-Type` header on download.

---

## File type restrictions

Admins configure `allowed_extensions` per app in the Console vault settings tab. Extensions are stored lowercase without leading dot (`["pdf", "jpg", "png"]`). An empty array allows all extensions. The extension is extracted from the filename's last `.` component, also lowercased. Restricted uploads return `415 Unsupported Media Type`.

---

## No versioning

If a file exists at `/{collection}/{filename}` within an app, re-uploading returns `409 Conflict`. The developer must delete the existing file or choose a different name. The filesystem is the source of truth — no shadow copies, no version history.

---

## Public file URL

```
http://api.{org}.local/vault/{app_slug}/{collection}/{filename}
```

The URL is stable once a file is made public and remains accessible until the file is made private or deleted. No expiry, no signed URL — Vault checks the `is_public` flag on every request.

---

## Console admin access

Console calls Vault directly over the Docker bridge using HMAC (no API key). The `userId` field in admin calls is the sentinel `"console-admin"`, logged as-is for audit trails. The Console can:

- Browse all files across collections
- Toggle `is_public` per file
- Delete files
- Configure `vault_settings` per app (allowed extensions, max file size)

File uploads from the Console are not currently supported — files are uploaded by app developers via the SDK or CLI.

---

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | ✅ | — | Postgres connection string |
| `INTERNAL_HMAC_SECRET` | ✅ | — | Shared HMAC secret — service refuses to start without it |
| `STORAGE_ROOT` | | `/var/nuble/storage` | Root directory for file storage |
| `PORT` | | `3003` | HTTP port |
| `LOG_LEVEL` | | `info` | Pino log level |
| `NODE_ENV` | | `development` | `production` disables pino-pretty |

---

## Test coverage

| Suite | Tests | What is covered |
|---|---|---|
| `storage.test.ts` | 23 | `validateSegment`, `resolveFilePath`, `saveFile`, `readFileBytes`, `removeFile`, `pathExists`, `fileExtension` |
| `files.test.ts` | 23 | All 7 authenticated routes — auth failures, validation, success paths (DB mocked) |
| `public.test.ts` | 5 | Public route — 404, 403 (private file), 200, cache-control, no auth required |

---

## References

- ADR 012 — `docs/adr/012-vault-storage-service.md`
- Service contract — `docs/documentation/service-contract.md`
- **SDK guide** — `docs/documentation/vault-sdk.md` (all methods, error codes, React hook)
- SDK source — `packages/vault/` (`@nublestation/vault`)
- Orbit service doc — `docs/documentation/orbit-service.md` (same filesystem + HMAC pattern)
