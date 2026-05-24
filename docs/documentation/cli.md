# nuble CLI

`@nublestation/cli` — the developer-facing command-line tool for NubleStation.

ADR: `docs/adr/008-cli-sdk-architecture.md`

---

## What it does

```
Developer machine
│
├── nuble init       → prompts for Gateway URL + API key, validates /healthz, writes ~/.nuble/config
├── nuble deploy     → zips dist/, POSTs to Gateway /v1/orbit/deploy
└── nuble status     → checks /healthz for each configured profile
```

---

## Installation

```bash
npx @nublestation/cli init
# or globally:
npm install -g @nublestation/cli
```

---

## Commands

### `nuble init`

```bash
nuble init [--profile <name>]
```

1. Prompts for: Gateway URL, API key (`nbl_<keyId>.<secret>`), app slug
2. Validates reachability via `GET {org_url}/healthz`
3. Writes to `~/.nuble/config` (TOML)

### `nuble deploy`

```bash
nuble deploy [--dist <path>] [--profile <name>]
```

1. Reads config profile (default: `default`)
2. Zips the contents of `<dist>` (default: `./dist`) — files at archive root
3. POSTs to `{org_url}/v1/orbit/deploy` with `Authorization: Bearer <api_key>`
4. Prints version on success

The ZIP must contain `index.html` at its root (Orbit validates this).

### `nuble status`

```bash
nuble status
```

Checks `GET {org_url}/healthz` for every profile in `~/.nuble/config` and prints the result.

---

## Config file

Location: `~/.nuble/config` (TOML, never committed)

```toml
[default]
org_url  = "http://api.clinic.local"
api_key  = "nbl_abc123.secret"
app_slug = "tasks"

[staging]
org_url  = "http://api.staging.local"
api_key  = "nbl_xyz789.secret"
app_slug = "tasks"
```

Use `--profile staging` to target a non-default profile.

---

## Bundle requirements

The `dist/` folder must:
- Contain `index.html` at its root
- Be under 50 MB when zipped
- Be any static SPA output (Vite, CRA, Next.js export, etc.)

---

## Phase gate summary (ADR 008)

| Command | Phase | Gate |
|---|---|---|
| `nuble init` | Phase 1 | Gateway `/healthz` |
| `nuble status` | Phase 1 | Gateway `/healthz` |
| `nuble deploy` | Phase 2 | Orbit (implemented) |
| `nuble apps list/create` | Phase 2 | Blaze admin routes |
| `nuble env set/list` | Phase 2 | Blaze admin routes |
| `nuble logs` | Phase 3 | SSE service |

---

## Development

```bash
# Run from monorepo root
pnpm cli:dev -- init
pnpm cli:test

# Or directly
cd packages/cli
pnpm dev init
pnpm test
```
