# ADR 007 — Orbit architecture (deployment service)

**Status:** Accepted
**Date:** 2026-05-21

## Context

NubleStation needs to host static frontends (React, Vue, Vite, Next.js export mode) built by app developers and serve them at `{app}.{org}.local`. **Orbit** is the service that owns this responsibility. It must be:

- Simple enough to deliver in v1
- LAN-native (fast enough to deploy on every change)
- Decoupled from Vault (blob storage)
- Accessible through a single CLI command

## Decisions

### 1. No per-app Docker containers

Apps are database rows, not containers (ADR 001 principle). Spinning up a Docker image per deployed frontend adds image build time, registry overhead, container lifecycle management, and memory consumption — all unnecessary for serving static files.

**Decision:** Caddy serves all deployed frontends directly from the host filesystem via a single wildcard vhost. No Docker API involvement on deploy.

### 2. Orbit is a separate container

Although Orbit only moves files, it still runs as its own container in the Compose stack. It exposes HTTP endpoints that the gateway forwards to; it needs Docker's restart policy and health checks; and it is the only service that requires write access to `/var/nuble/apps/` — keeping it isolated limits blast radius.

Filesystem access is solved with a bind mount:

```yaml
orbit:
  volumes:
    - /var/nuble/apps:/var/nuble/apps:rw
```

Caddy reads the same host path via its own bind mount (`:ro`). Same files, no copying.

### 3. Vault is purely blob storage

Vault (`/var/nuble/blobs/`) and Orbit (`/var/nuble/apps/`) own separate paths and serve different access patterns:

| | Vault | Orbit |
|---|---|---|
| Writer | App developer via SDK | `nuble` CLI via API |
| Reader | App developer via API | Caddy directly from disk |
| Semantics | S3-like objects + metadata | Zip extraction + atomic overwrite |
| Failure coupling | Independent | Independent |

Merging them or running two Vault instances would couple two independent failure domains and force Vault to understand zip extraction and Caddy path conventions.

### 4. Single live version + one rollback step

One live build per app under `current/`, plus a single retained previous build under `.previous/` that the rollback endpoint can promote. No deeper history on disk; `platform.deployments` keeps the full audit trail.

```
/var/nuble/apps/{app-slug}/
  current/              ← Caddy serves this (read-only mount in Caddy)
  .incoming-{ts}/       ← transient: populated while extracting the upload
  .previous/            ← one-deep rollback bin (overwritten on each successful deploy)
```

**Deploy algorithm (atomic swap, two-step):**

```
1. mkdir {slug}/.incoming-{ts}
2. Stream zip into {slug}/.incoming-{ts} (yauzl, see §9; zip-slip guarded)
3. Validate: index.html present at root of extraction
4. If {slug}/current exists:
     4a. rm -rf {slug}/.previous          (drop the old rollback bin)
     4b. mv {slug}/current → {slug}/.previous
5. mv {slug}/.incoming-{ts} → {slug}/current
6. (M8) POST to Blaze internal route to record platform.deployments row
```

The two `mv` calls in steps 4b–5 are not transactional, but the gap is sub-millisecond on a local filesystem. If Orbit crashes mid-swap, the next deploy's step 1 re-creates a fresh `.incoming-{ts}` (the timestamp suffix prevents collision with any leftover from the crash), and a startup sweeper removes orphaned `.incoming-*` directories. Caddy returns 404 during the gap, which is acceptable on LAN.

**`platform.deployments`** retains the full deployment history (version, checksum, deployed_at, status) for audit in the console — the on-disk `.previous/` is only the one-step rollback target, not the source of truth for history.

### 5. CLI pipeline always runs in full

The `nuble deploy` command always executes the complete pipeline regardless of whether a build artifact already exists:

```
nuble deploy
  1. type check          (tsc --noEmit)
  2. build               (npm/pnpm run build)
  3. validate output     (detect dist/, out/, build/)
  4. inject env vars     (NUBLE_URL, NUBLE_API_KEY into bundle env)
  5. zip                 (zip slip prevention, size check)
  6. transfer            (POST api.{org}.local/deploy/v1/upload)
  7. confirm             (print deployment ID + live URL)
```

Rationale: on LAN the full pipeline takes seconds. Skipping steps to save time on a local network is premature optimization that removes the safety guarantees the pipeline provides. A broken type check should always block the upload.

No `--prebuilt` flag in v1. The pipeline is the contract.

### 6. Framework support and constraints

The rule is: **if `npm run build` produces a folder of static files with no Node.js process needed to serve them, it works.** If it requires a runtime process (Express, Node HTTP server, edge functions), it does not.

**In scope — produces static output:**

| Framework | Output dir | Required config |
|---|---|---|
| Vite (React, Vue, Svelte, vanilla) | `dist/` | none |
| Create React App | `build/` | none |
| Next.js | `out/` | `output: 'export'` in next.config.js |
| Nuxt.js | `dist/` | `ssr: false` + `target: 'static'` |
| SvelteKit | `build/` | `@sveltejs/adapter-static` |
| Astro | `dist/` | `output: 'static'` in astro.config.mjs |
| Angular | `dist/{project}/` | none |
| Plain HTML/CSS/JS | any | `--dir` flag on `nuble deploy` |

**Out of scope — requires a server runtime:**

| Framework | Reason |
|---|---|
| Next.js (SSR/ISR mode) | Requires Node.js server; no static export configured |
| Remix | Server-required by design; no static export path |
| Nuxt.js (SSR mode) | Requires Node.js server |
| SvelteKit (without static adapter) | Requires Node/Edge runtime |
| Astro (SSR mode) | Requires server adapter |

If the CLI detects an incompatible configuration (e.g. Next.js without `output: 'export'`), it aborts before building with a clear message pointing to the required config change. SSR hosting is out of scope — NubleStation hosts frontends, not Node.js servers.

### 7. SDK wiring and CORS

Deployed frontends interact with NubleStation services (db, storage, auth) via `@nublestation/sdk`. The SDK makes browser fetch requests from `{app}.{org}.local` to `api.{org}.local`.

**CORS:** The gateway sets `Access-Control-Allow-Origin: http://*.{org}.local` at startup using the org domain from its config. This is the only CORS configuration needed — no per-app rules.

**Env injection:** `nuble deploy` reads `~/.nuble/config` (written by `nuble init` at first setup) and injects two env vars into the build environment before running the build step:

```
NUBLE_URL=http://api.{org}.local
NUBLE_API_KEY=nbl_<key_id>.<secret>
```

The developer references these in their app:

```js
import { NubleClient } from '@nublestation/sdk'

const nuble = new NubleClient({
  url: import.meta.env.NUBLE_URL,
  apiKey: import.meta.env.NUBLE_API_KEY,
})
```

The API key is embedded in the frontend bundle. This is acceptable because NubleStation is LAN-only — there is no public internet exposure. The console's Envs & Secrets tab surfaces the same values for reference.

### 8. HMAC payload carries the app slug

The gateway resolves the API key to `(app_id, app_slug)` and passes the slug to Orbit as a signed header. Orbit trusts the slug **only because it is part of the HMAC-signed payload** — it never queries Blaze to translate `app_id → slug`. This keeps Orbit's M5 dependency surface zero (no DB connection).

| Header | Type | Origin |
|---|---|---|
| `X-Nuble-App-Id` | UUID | `platform.api_keys.app_id` |
| `X-Nuble-App-Slug` | kebab-case | `platform.apps.slug` (joined via `app_id`) |
| `X-Nuble-User-Id` | UUID | session (M5 placeholder = `api_keys.id`) |
| `X-Nuble-Timestamp` | unix ms | gateway clock |
| `X-Nuble-Sig` | hex | HMAC-SHA256 of canonical payload |

**Canonical payload extension.** `packages/shared/src/hmac.ts` gains an optional `extraFields: Record<string, string>` parameter. Keys are sorted lexicographically and appended as `KEY=VALUE\n` lines after the timestamp. When omitted (Blaze), the payload is byte-identical to the v1 format — **no signature change for existing services**.

```
METHOD\n
PATH\n
BODY_SHA256_HEX\n
TIMESTAMP\n
[appSlug=<slug>\n if extraFields present]
```

Future services attach their own fields (Vault may sign `{ filename, contentType }`, etc.) without touching Blaze's call sites.

### 9. Streaming end-to-end (yauzl + busboy)

For Orbit's clinic-mini-PC target, peak RAM during deploy must be bounded regardless of zip size. The full path is a stream:

```
HTTP request body (Node ReadableStream)
   → busboy (multipart parser, streaming)
   → file field stream
   → yauzl (zip parser, central-directory based — opens each entry as a stream)
   → fs.createWriteStream(targetPath)
```

`busboy` and `yauzl` both work over Node streams and never buffer the full payload. Memory peak is bounded by yauzl's internal read-buffer (~16 KB) plus a small per-write buffer.

**Why not `adm-zip`?** It loads the entire archive into memory before iterating. A 100 MB upload becomes ~150 MB RAM peak. Unacceptable for the deployment target.

**Why not SSH/SCP?** Considered, rejected. HTTP-via-gateway is the chosen transport because it reuses the HMAC trust model, the gateway's per-org CORS/auth, and avoids requiring SSH keys on every developer's machine. The streaming HTTP path achieves the same memory footprint as SCP.

### 10. Rollback endpoint

A second route `POST /v1/rollback` swaps `current/` and `.previous/` atomically:

```
1. If {slug}/.previous does not exist → 404 no_rollback_available
2. mv {slug}/current → {slug}/.swap-tmp
3. mv {slug}/.previous → {slug}/current
4. mv {slug}/.swap-tmp → {slug}/.previous
```

After step 4, `.previous/` now holds the build the user just rolled back from — so a second rollback request returns the user to the original deployment. Symmetric, idempotent within reason.

Triggered manually (console "Rollback" button, or `curl` for ops). No auto-rollback in v1 — that requires health checks against the deployed frontend, which is its own design (deferred to v1.5).

## Orbit HTTP endpoints

All routes sit behind HMAC middleware (ADR 003 §HMAC). The gateway forwards requests from `api.{org}.local/deploy/*`.

| Method | Path | Description |
|---|---|---|
| `POST` | `/v1/upload` | Receive multipart zip (streamed), validate, extract, atomic swap |
| `POST` | `/v1/rollback` | Swap `current/` ↔ `.previous/` for the targeted app |
| `GET` | `/healthz` | Liveness — process is up |
| `GET` | `/readyz` | Readiness — `NUBLE_APPS_DIR` is writable and free space ≥ threshold |

`platform.deployments` write (in M8) is the only database interaction — via Blaze's internal route, not a direct Postgres connection.

## Filesystem layout

```
$NUBLE_APPS_DIR/                        Mac:    /Users/<you>/.nuble-dev/apps
                                        Docker: /var/nuble/apps
  {app-slug}/
    current/             ← served by Caddy at {app-slug}.{org}.local (Caddy reads :ro)
    .incoming-{ts}/      ← transient, populated mid-upload; orphans swept at startup
    .previous/           ← one-deep rollback bin; rotated on each successful deploy
```

`NUBLE_APPS_DIR` is the single env var that distinguishes Mac dev from Docker staging. Code is identical.

Caddy wildcard vhost (simplified):

```
*.{org}.local {
  # system subdomains handled above this block
  root * /var/nuble/apps/{labels.1}/current
  file_server
  try_files {path} /index.html   # SPA fallback
}
```

The SPA fallback (`try_files … /index.html`) allows client-side routers (React Router, Vue Router) to handle their own paths without 404s from Caddy.

## Consequences

- Orbit is the simplest service in the stack: two HTTP routes, no DB connection in M5, no Redis, no SSE
- One-step rollback is shipped in v1 (`POST /v1/rollback`); deeper history stays in `platform.deployments`
- Auto-rollback (health-check-driven) deferred to v1.5 as a standalone concern
- SSE / real-time deploy status deferred to v1.5 as a standalone service
- Developers must use `output: 'export'` for Next.js — documented in `nuble init` output and CLI error messages
- `packages/shared/src/hmac.ts` is extended with optional `extraFields` — Blaze's existing signatures stay byte-identical, no migration needed

## References

- ADR 001 — apps are database rows, not containers
- ADR 003 — HMAC internal trust model (Orbit sits behind it)
- ADR 006 — install.sh creates `/var/nuble/apps/` on the host before Compose starts
