---
title: CLI Commands
description: Full reference for the nuble command-line tool.
---

import { Aside } from '@astrojs/starlight/components';

<Aside type="note">
  The `nuble` CLI (`@nublestation/cli`) is under development. Commands listed here reflect the planned v1 surface.
</Aside>

## Installation

```bash
npm install -g @nublestation/cli
# or
pnpm add -g @nublestation/cli
```

## Global flags

| Flag | Description |
|---|---|
| `--app <name>` | Target app name (overrides `NUBLE_APP` env var) |
| `--url <url>` | NubleStation gateway URL (overrides `NUBLE_URL` env var) |
| `--key <key>` | API key (overrides `NUBLE_API_KEY` env var) |
| `--help` | Print command help |
| `--version` | Print CLI version |

## Configuration

The CLI reads config from environment variables or a `.nuble` file in the project root:

```bash
# .nuble (project-level, commit this)
NUBLE_URL=http://api.clinic.local
NUBLE_APP=tasks

# Shell environment (don't commit)
export NUBLE_API_KEY=nbl_abc123.supersecret
```

---

## `nuble db push`

Push `schema.ts` to NubleStation — runs migrations and generates types.

```bash
nuble db push --app tasks
```

**What it does:**

1. Reads `schema.ts` from the current directory
2. Sends it to `POST /v1/db/schema`
3. The DB service generates migration SQL, injects `app_id` and RLS, and runs it
4. Writes generated types to `.nuble/types.ts`

**Options:**

| Flag | Description |
|---|---|
| `--dry-run` | Print the SQL that would run, without running it |
| `--schema <path>` | Path to schema file (default: `./schema.ts`) |

---

## `nuble deploy`

Upload a frontend bundle to NubleStation.

```bash
nuble deploy --app tasks
nuble deploy --app tasks --dir ./build
```

**What it does:**

1. Zips the `dist/` directory (or `--dir`)
2. Uploads to `POST /v1/deploy/{appname}`
3. The Deploy Service extracts it to `/var/nuble/{appname}/`
4. Caddy serves the new files immediately

**Options:**

| Flag | Description |
|---|---|
| `--dir <path>` | Bundle directory (default: `./dist`) |
| `--version <ver>` | Version label for deployment history (default: git SHA) |

---

## `nuble push`

Atomic schema + deploy: runs `db push` first, then `deploy`.

```bash
nuble push --app tasks
```

If the schema migration fails, the deploy does not run.

---

## `nuble status`

Show the status of all NubleStation services.

```bash
nuble status
```

Output:

```
NubleStation  api.clinic.local

  gateway     ✔  healthy
  db          ✔  healthy
  auth        ✔  healthy
  storage     ✔  healthy
  deploy      ✔  healthy
  console     ✔  healthy
  postgres    ✔  healthy
  redis       ✔  healthy
  coredns     ✔  healthy
  caddy       ✔  healthy
```

---

## `nuble apps`

List all apps in the organization.

```bash
nuble apps
```

---

## `nuble apps create`

Create a new app.

```bash
nuble apps create --name tasks
```

---

## `nuble keys list`

List API keys for an app.

```bash
nuble keys list --app tasks
```

---

## `nuble keys create`

Create a new API key for an app.

```bash
nuble keys create --app tasks --label "CI key"
```

Output:

```
API key created (shown once — save it now):

  nbl_abc123.supersecret-value-here
```

---

## `nuble keys revoke`

Revoke an API key.

```bash
nuble keys revoke <key-id>
```

---

## `nuble db migrations`

List applied migrations for an app.

```bash
nuble db migrations --app tasks
```

---

## Environment variables

| Variable | Description |
|---|---|
| `NUBLE_URL` | Gateway base URL (e.g., `http://api.clinic.local`) |
| `NUBLE_APP` | Default app name |
| `NUBLE_API_KEY` | API key (`nbl_<key_id>.<secret>`) |
