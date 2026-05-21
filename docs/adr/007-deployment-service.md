# ADR 007 — Deployment service architecture

**Status:** Accepted
**Date:** 2026-05-21

## Context

NubleStation needs to host static frontends (React, Vue, Vite, Next.js export mode) built by app developers and serve them at `{app}.{org}.local`. The deployment mechanism must be:

- Simple enough to deliver in v1
- LAN-native (fast enough to deploy on every change)
- Decoupled from the blob storage service
- Accessible through a single CLI command

## Decisions

### 1. No per-app Docker containers

Apps are database rows, not containers (ADR 001 principle). Spinning up a Docker image per deployed frontend adds image build time, registry overhead, container lifecycle management, and memory consumption — all unnecessary for serving static files.

**Decision:** Caddy serves all deployed frontends directly from the host filesystem via a single wildcard vhost. No Docker API involvement on deploy.

### 2. Deploy service is a separate container

Although the deploy service only moves files, it still runs as its own container in the Compose stack. It exposes HTTP endpoints that the gateway forwards to; it needs Docker's restart policy and health checks; and it is the only service that requires write access to `/var/nuble/apps/` — keeping it isolated limits blast radius.

Filesystem access is solved with a bind mount:

```yaml
deploy:
  volumes:
    - /var/nuble/apps:/var/nuble/apps:rw
```

Caddy reads the same host path via its own bind mount (`:ro`). Same files, no copying.

### 3. Storage service is purely blob storage

The storage service (`/var/nuble/blobs/`) and the deploy service (`/var/nuble/apps/`) own separate paths and serve different access patterns:

| | Storage service | Deploy service |
|---|---|---|
| Writer | App developer via SDK | `nuble` CLI via API |
| Reader | App developer via API | Caddy directly from disk |
| Semantics | S3-like objects + metadata | Zip extraction + atomic overwrite |
| Failure coupling | Independent | Independent |

Merging them or running two storage instances would couple two independent failure domains and force the storage service to understand zip extraction and Caddy path conventions.

### 4. Single version per app (current only)

Only one version is kept on disk per app — the currently deployed build. There is no rollback in v1.

```
/var/nuble/apps/{app-slug}/
  current/    ← Caddy serves this
```

On deploy:
1. Extract zip to `{app-slug}/incoming/`
2. Remove `{app-slug}/current/` if it exists
3. Rename `incoming/` → `current/`
4. Write row to `platform.deployments`

`platform.deployments` retains the deployment history (version, checksum, deployed_at) for audit in the console. Rollback in v2 is a `mv` away when the time comes.

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

## Deploy service HTTP endpoints

All routes sit behind HMAC middleware (ADR 003 §HMAC). The gateway forwards requests from `api.{org}.local/deploy/*`.

| Method | Path | Description |
|---|---|---|
| `POST` | `/v1/upload` | Receive multipart zip, validate, extract, record deployment |
| `GET` | `/healthz` | Health check (no auth) |

`platform.deployments` write is the only database interaction — via the db service internal route, not a direct Postgres connection.

## Filesystem layout

```
/var/nuble/
  apps/
    {app-slug}/
      current/          ← served by Caddy at {app-slug}.{org}.local
      incoming/         ← transient during active deploy, removed after
```

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

- Deploy service is the simplest service in the stack: one endpoint, no DB connection, no Redis, no SSE
- No rollback in v1 — acceptable trade-off for delivery speed; v2 adds a `previous/` directory
- SSE / real-time deploy status deferred to v1.5 as a standalone service
- Developers must use `output: 'export'` for Next.js — documented in `nuble init` output and CLI error messages

## References

- ADR 001 — apps are database rows, not containers
- ADR 003 — HMAC internal trust model (deploy service sits behind it)
- ADR 006 — install.sh creates `/var/nuble/apps/` on the host before Compose starts
