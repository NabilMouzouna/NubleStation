# ADR 008 — CLI and SDK architecture

**Status:** Accepted
**Date:** 2026-05-21

## Context

NubleStation needs two developer-facing packages:

- A **runtime SDK** (`@nublestation/sdk`) that app developers ship inside their frontend bundles to call NubleStation services from the browser.
- A **CLI** (`@nublestation/cli`) that app developers run on their machine to initialize projects and deploy builds.

Unlike every other ADR, this one is **phase-gated** — CLI commands can only function after their backing service is operational. The CLI is the last layer; it cannot be fully implemented until the service layer beneath it exists. This ADR defines the architecture, separation rationale, and command-availability schedule so implementation stays synchronized with service delivery.

---

## Decisions

### 1. Two separate packages, not one

The SDK is a **browser runtime dependency** — it gets bundled into the developer's app and shipped as JavaScript to the end user's device. The CLI is a **Node.js dev tool** — it runs on the developer's machine and never ships to users.

Bundling them breaks the SDK for browser bundlers:

| Package | Runtime | Key deps | Installed as |
|---|---|---|---|
| `@nublestation/sdk` | Browser + Node.js | none (native `fetch`) | `dependencies` |
| `@nublestation/cli` | Node.js only | `archiver`, `execa`, `inquirer`, `undici` | `devDependencies` or global |

If the CLI's Node.js deps (especially `fs`, `child_process`, `archiver`) land in the same package as the SDK, Vite/webpack either error on import or bloat the production bundle. The packages must be separated.

The CLI may import **types** from the SDK (shared interface definitions), but never runtime code.

### 2. `nuble init` bridges the gap — developer installs nothing manually

Although the packages are separate, the developer experience is a single command:

```sh
npx @nublestation/cli init
```

`nuble init` does everything:

1. Prompt for org domain (`clinic.local`) and API key (`nbl_<keyId>.<secret>`).
2. Validate by calling `GET http://api.{org}.local/healthz` — fails fast if the org is unreachable.
3. Write `~/.nuble/config` (TOML) with `org_url`, `api_key`, `app_slug`.
4. Run `npm install @nublestation/sdk` (or `pnpm add`, auto-detected from lockfile) in the current project directory.
5. Print the SDK quick-start snippet.

The developer never looks up the SDK package name or version. `init` pins the correct version automatically.

### 3. SDK module surface (v1)

The SDK is a thin authenticated fetch wrapper. Each module maps to a service path on the gateway:

```ts
import { NubleClient } from '@nublestation/sdk'

const nuble = new NubleClient({
  url: import.meta.env.NUBLE_URL,       // injected by `nuble deploy`
  apiKey: import.meta.env.NUBLE_API_KEY, // injected by `nuble deploy`
})

// DB service — ADR 003
await nuble.db.query('SELECT * FROM tasks WHERE ...')

// Storage service
await nuble.storage.upload(file)
await nuble.storage.getUrl(key)

// Auth — future (v1.5)
await nuble.auth.signIn({ email, password })
```

In v1 the SDK is thin — it adds the `Authorization` header, handles errors, and provides typed wrappers. It does not generate types from the schema (that is Phase 3 / v2).

### 4. CLI command inventory and service dependencies

Every command has a **gate** — the service it requires to be running. Commands that depend on unimplemented services are coded but return a clear `NOT_AVAILABLE` error rather than being omitted.

| Command | Description | Gate (required service) | Phase |
|---|---|---|---|
| `nuble init` | Connect to org, write config, install SDK | Gateway `/healthz` | Phase 1 |
| `nuble status` | Show health of all services | Gateway `/healthz` per service | Phase 1 |
| `nuble deploy` | Full build + upload pipeline (ADR 007) | Orbit | Phase 2 |
| `nuble apps list` | List apps in the org | Blaze `/v1/admin/apps` | Phase 2 |
| `nuble apps create` | Create a new app | Blaze | Phase 2 |
| `nuble env set` | Write an env var for an app | Blaze | Phase 2 |
| `nuble env list` | List env vars for an app | Blaze | Phase 2 |
| `nuble logs` | Stream container logs via SSE | SSE service (v1.5) | Phase 3 |
| `nuble db push` | Push app-developer schema migration | Blaze | Phase 3 |

`nuble deploy` is the most important Phase 2 command — it is the core value proposition. All other Phase 2 commands are secondary.

### 5. Config file format

`~/.nuble/config` is TOML, one profile per org:

```toml
[default]
org_url   = "http://api.clinic.local"
api_key   = "nbl_abc123.secret"
app_slug  = "tasks"

[staging]
org_url   = "http://api.staging.local"
api_key   = "nbl_xyz789.secret"
app_slug  = "tasks"
```

`nuble deploy` reads `default` unless `--profile` is passed. The file is in the developer's home directory — never committed, never inside the app project.

### 6. No authentication to the CLI itself

The API key in `~/.nuble/config` is the credential. The CLI sends it as `Authorization: Bearer nbl_<keyId>.<secret>` on every request. There is no separate CLI login flow — the key already represents the developer's app access (`user_app_access` row). This is the same credential the deployed frontend uses.

### 7. Env injection during deploy (recap from ADR 007)

`nuble deploy` injects two environment variables into the build before running `npm run build`:

```sh
NUBLE_URL=http://api.clinic.local
NUBLE_API_KEY=nbl_<keyId>.<secret>
```

These land in the Vite/CRA bundle as `import.meta.env.NUBLE_URL` etc. The developer references them in their `NubleClient` constructor. No `.env` file needs to be committed.

### 8. Distribution

Both packages are published to npm under the `@nublestation` scope.

| Package | Registry | Install method |
|---|---|---|
| `@nublestation/sdk` | npm public | `pnpm add @nublestation/sdk` (via `nuble init`) |
| `@nublestation/cli` | npm public | `npx @nublestation/cli` (no global install required) |

Publishing triggers on push to `main` via GitHub Actions (`release.yml`) — same release pipeline as all other packages.

---

## Phase gate summary

```
Phase 1 (now)       — packages/sdk scaffold, packages/cli scaffold, nuble init + nuble status
Phase 2             — nuble deploy (needs Orbit), nuble apps/env (needs Blaze admin routes)
Phase 3 (v1.5)      — nuble logs (needs SSE service), nuble db push (needs schema DSL)
```

Scaffolding both packages now establishes the repo layout, tsconfig, and publish pipeline before any commands are functional. Each command is gated at runtime, not omitted from the codebase.

---

## Consequences

- SDK stays browser-safe — no Node.js deps leak into it
- Developers run one command (`nuble init`) to get everything set up
- CLI commands that depend on unimplemented services fail gracefully with a clear message rather than silently doing nothing
- Config lives in home directory — never accidentally committed
- No separate CLI auth — API key is the credential everywhere (SDK, CLI, deployed frontend)

---

## References

- ADR 001 — apps are database rows, not containers
- ADR 003 — DB service, HMAC internal headers, API key format (`nbl_<keyId>.<secret>`)
- ADR 007 — Deploy service, full CLI pipeline, env injection
