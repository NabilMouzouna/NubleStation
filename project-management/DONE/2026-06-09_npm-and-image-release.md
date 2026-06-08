# Recap — Production release (npm + Docker :latest + docs)

**Date:** 2026-06-09
**Branches:** feature/blaze → dev → staging → main

## What shipped

Merged all outstanding work (Blaze M1–M8, unified `nubleClient`, Blaze-backed bucket
comments, docs site sync, DNS Doctor) to `main`, triggering the full release pipeline.

### Published to npm (push to main)
| Package | Version | Notes |
|---|---|---|
| `@nublestation/cli` | 0.3.0 | bumped from 0.2.0 (was already published) |
| `@nublestation/vault` | 0.1.0 | first publish |
| `@nublestation/identity` | 0.1.0 | first publish — **new publish job** |
| `@nublestation/blaze` | 0.1.0 | first publish — **new publish job** |
| `@nublestation/client` | 0.1.0 | first publish; depends on the three above |

`@nublestation/client` is an umbrella/facade: it depends on vault + identity + blaze via
`workspace:*`, which pnpm rewrites to the exact `0.1.0` at publish. Verified the packed
tarball declares real versions, so `npm install @nublestation/client` resolves cleanly.
This is the standard npm monorepo pattern (Babel / AWS SDK / Sentry style) — chosen over
bundling so each SDK stays independently installable.

### Docker images (ghcr.io, :latest)
orbit, gateway, blaze, vault, identity, console — all rebuilt and pushed.

### Other
- GitHub Release `v0.3.0` created with `install.sh` + infra files.
- Docs site deployed to GitHub Pages (also deploys on push to `dev`).

## Pipeline changes made
- `.github/workflows/release.yml`: added `publish-blaze` and `publish-identity` jobs;
  `publish-client` now builds vault + blaze + identity before client.
- `packages/cli/package.json`: 0.2.0 → 0.3.0.

## Fix included in this release
- `apps/blaze/Dockerfile`: build the `@nublestation/blaze` package before `pnpm deploy`,
  otherwise `files: ["dist"]` shipped an empty package and the container crash-looped on
  `ERR_MODULE_NOT_FOUND` (the M2+ code imports runtime values from the package).

## Notes / follow-ups
- CI shows Node 20 action-deprecation warnings (non-blocking; GitHub forces Node 24 on
  2026-06-16). Bumping action versions is a future chore.
- `infra/.env` on the dev host is a **directory**, not a file, so `docker compose`
  substitutes blank `DATABASE_URL`/`INTERNAL_HMAC_SECRET`. The stack must be started with
  those exported in the shell. Worth fixing into a real env file.
