# Orbit — deployment service

Orbit accepts static frontend bundles from the `nuble` CLI, extracts them atomically, and stores them where Caddy can serve them. It is the only service that writes to the host filesystem.

ADR: `docs/adr/007-deployment-service.md`

---

## What Orbit does

```
nuble deploy  →  Gateway  →  Orbit
                                │
                   resolve appSlug (from signed header)
                   write zip to .incoming-{ts}.zip
                   extract to .incoming-{ts}/
                   validate index.html exists
                   rm .previous/ (if any)
                   mv current/ → .previous/
                   mv .incoming-{ts}/ → current/
                                │
                   Caddy serves {slug}.{org}.local → current/
```

---

## Routes

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/healthz` | none | Liveness — always 200 |
| `GET` | `/readyz` | none | Readiness — checks storage is writable |
| `POST` | `/v1/orbit/deploy` | HMAC | Upload a zip bundle and deploy it |
| `POST` | `/v1/orbit/rollback` | HMAC | Swap `current/` ↔ `.previous/` |

All `/v1/*` routes require a valid HMAC signature from the Gateway (service contract, ADR 009).

---

## Filesystem layout

```
STORAGE_ROOT/               default: /var/nuble/apps  (Docker: nuble-apps volume)
  {app-slug}/
    current/                live — Caddy serves this
    .previous/              one rollback step (absent if no prior deploy)
    .incoming-{ts}/         transient during upload; always cleaned up
    .incoming-{ts}.zip      transient during upload; always cleaned up
```

The `current/` directory must contain an `index.html` at its root. The deploy is rejected with `422` if it doesn't.

---

## App slug

Orbit has no database connection. The app slug (e.g. `tasks`) is resolved by the Gateway: it JOINs `platform.api_keys` with `platform.apps` during API key verification, then forwards the slug as `x-nuble-app-slug` in the signed internal request. Orbit's HMAC middleware validates the slug format and exposes it as `c.var.appSlug`.

---

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `INTERNAL_HMAC_SECRET` | yes | — | Shared secret with Gateway (min 16 chars) |
| `STORAGE_ROOT` | no | `/var/nuble/apps` | Base path for all app bundles |
| `PORT` | no | `3002` | HTTP listen port |
| `LOG_LEVEL` | no | `info` | Pino log level |
| `NODE_ENV` | no | `development` | `development` enables pretty-print logs |

Orbit has no `DATABASE_URL` — it is intentionally stateless.

---

## Bundle requirements

- Format: `application/zip` (`.zip`)
- Maximum size: 50 MB
- Must contain `index.html` at the root of the archive
- Any static SPA output works: Vite, CRA, Next.js with `output: 'export'`, etc.

---

## Error responses

All errors follow the standard shape `{ ok: false, error: "<code>" }`.

| Code | Status | Meaning |
|---|---|---|
| `missing_signature_headers` | 401 | One of the four HMAC headers is absent |
| `stale_or_invalid_timestamp` | 401 | Timestamp skew > 30 s |
| `invalid_app_id` | 400 | `x-nuble-app-id` is not a valid UUID |
| `invalid_app_slug` | 400 | `x-nuble-app-slug` failed slug format check |
| `bad_signature` | 401 | HMAC does not match |
| `invalid_content_type` | 400 | Request is not `multipart/form-data` |
| `missing_bundle_field` | 400 | Multipart body has no `bundle` field |
| `bundle_too_large` | 413 | Zip exceeds 50 MB |
| `missing_index_html` | 422 | Zip extracted successfully but `index.html` not found at root |
| `deploy_failed` | 500 | Filesystem error during atomic swap |
| `no_previous_version` | 409 | Rollback requested but `.previous/` does not exist |
| `rollback_failed` | 500 | Filesystem error during rollback |

---

## Running locally

```bash
# Copy the example env
cp apps/orbit/.env.example apps/orbit/.env.local
# Edit STORAGE_ROOT and secrets as needed

pnpm orbit:dev
# or: cd apps/orbit && pnpm dev
```

**Verify:**
```bash
curl http://localhost:3002/healthz   # → {"ok":true}
curl http://localhost:3002/readyz    # → {"ok":true}
```

**Manual deploy test** (direct to Orbit, bypassing Gateway):
```bash
# Build a minimal bundle
mkdir -p /tmp/test-bundle && echo "<h1>hello</h1>" > /tmp/test-bundle/index.html
cd /tmp && zip -r test-bundle.zip test-bundle/ && cd -

# Compute HMAC manually (or use the test script)
# For now, test via Gateway with a real API key — see Gateway docs
```
