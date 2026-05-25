---
title: "Orbit — Deploy Service"
description: Frontend bundle uploads and static file hosting. Coming soon.
---

import { Aside } from '@astrojs/starlight/components';

<Aside type="caution">
  The Deploy Service is planned for a future phase. This page documents the intended design.
</Aside>

## What it does

The Deploy Service receives frontend bundles from the `nuble deploy` CLI command and places them on disk where Caddy can serve them.

```
Developer machine
  └── nuble deploy --app tasks
        → zips dist/
        → POST /v1/deploy/tasks  (multipart upload)
        → Deploy Service extracts to /var/nuble/tasks/
        → Caddy serves tasks.{org}.local from that directory immediately
```

No restart, no reload — Caddy's wildcard rule serves the directory as soon as the files land.

## Deployment flow

1. CLI zips the `dist/` folder and uploads it to `api.{org}.local/v1/deploy/{appname}`
2. The API Gateway verifies the API key and forwards to the Deploy Service with HMAC headers
3. The Deploy Service verifies the HMAC, checks the caller has permission to deploy to that app
4. Extracts the bundle to `/var/nuble/{appname}/` (atomic replace — the new version goes to a temp path, then is moved into place)
5. Writes a row to `platform.deployments` with version, timestamp, and the deploying user
6. Returns `200 OK`

## Versioned history

Every deployment is tracked in `platform.deployments`:

```
platform.deployments
├── id            UUID
├── app_id        → which app
├── version       semver or git SHA
├── status        deployed | rolled_back
├── deployed_at   timestamptz
└── deployed_by   → which user
```

Rollback (v2) will re-extract a previous version from a stored snapshot.

## Planned CLI command

```bash
nuble deploy --app tasks

# With explicit dist directory
nuble deploy --app tasks --dir ./build

# Atomic push: schema first, then frontend
nuble push --app tasks
```
