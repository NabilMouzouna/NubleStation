# M7 — nuble db push CLI Command

**Commit:** `56decb7`
**Branch:** `feature/blaze`
**Date:** 2026-06-07

## What was built

| File | Role |
|---|---|
| `packages/cli/src/commands/db.ts` | `runDbPush()` implementation |
| `packages/cli/src/index.ts` | `nuble db push` command registration |
| `apps/blaze/src/routes/admin.ts` | Added `POST /v1/blaze/admin/migrations` (no `:appId` in path) |

## Key decisions

- **Node.js --experimental-strip-types for TS loading:** The CLI spawns a child process with `--experimental-strip-types --input-type=module --eval <runner>` to import the developer's `schema.ts`. No tsx needed at runtime. Requires Node.js 22+ (already required by the CLI).
- **Schema from user's project, not bundled:** `import('@nublestation/blaze')` in the runner resolves from the developer's `node_modules` (cwd is set to the project root). No CLI ↔ blaze coupling at build time.
- **Companion route without :appId:** Added `POST /v1/blaze/admin/migrations` so the CLI doesn't need to know the app's UUID — the Gateway injects it via HMAC headers. The existing `POST /v1/blaze/admin/apps/:appId/migrations` is kept for integrations that already have the UUID.
- **No-op output:** The route returns `status: "no-op"` when the checksum matches; CLI prints "Schema unchanged".
- **Schema default:** `--schema schema.ts` in the current working directory.

## Usage

```bash
nuble db push                    # reads schema.ts in cwd
nuble db push --schema src/schema.ts
nuble db push --profile staging
```
