# Orbit — Scaffold (M5.1)

> First step of the Orbit service. Get a Hono process booting on a port, with config validation, structured logging, and a `/healthz` endpoint. No HMAC, no zip, no business logic yet.

## Goal

`pnpm orbit:dev` boots the service on `localhost:3004` and `curl localhost:3004/healthz` returns `{"ok":true}`. The shape of the codebase mirrors `apps/blaze/` so anything you learn there transfers.

## Files to create

```
apps/orbit/
├── package.json              name: @nublestation/orbit, type: module
├── tsconfig.json             extends @nublestation/typescript-config/base.json
├── eslint.config.mjs         re-uses @nublestation/eslint-config/base
├── vitest.config.ts          forks pool, NUBLE_ENV_FILE=.env.local
├── .env.example              NUBLE_APPS_DIR, INTERNAL_HMAC_SECRET, PORT=3004, ...
├── .gitignore                .env.local, .env.docker, dist/, node_modules/
├── README.md                 (placeholder; full README in orbit-dev-helper task)
└── src/
    ├── index.ts              boot: loadConfig → ensureAppsDir → serve(app, port)
    ├── server.ts             Hono app factory: error middleware → routes
    ├── config.ts             zod env schema, loadConfig() cached
    ├── logger.ts             Pino with pino-pretty in dev
    ├── types.ts              Hono Variables type stub (filled in by HMAC task)
    ├── middleware/
    │   └── error.ts          onError → JSON envelope
    └── routes/
        └── health.ts         GET /healthz, GET /readyz (readiness checks NUBLE_APPS_DIR writable + has ≥ 100 MB free)
```

## Dependencies

```
hono ^4
@hono/node-server ^1
@nublestation/shared workspace:*
dotenv ^16
pino ^9
pino-pretty ^11
zod ^3
```

Dev deps: `@nublestation/eslint-config`, `@nublestation/typescript-config`, `@types/node`, `typescript`, `tsx`, `vitest`.

## Root wiring

Add to root `package.json` scripts:

```json
"orbit:dev": "pnpm --filter @nublestation/orbit dev",
"orbit:test": "pnpm --filter @nublestation/orbit test"
```

No change to `turbo.json` (generic `dev`/`test` tasks already cover it).

## Mac dev

Create the apps directory once:

```sh
mkdir -p ~/.nuble-dev/apps
```

`.env.local`:

```
NUBLE_APPS_DIR=/Users/<you>/.nuble-dev/apps
INTERNAL_HMAC_SECRET=dev-secret-not-for-prod-min-16-chars
PORT=3004
LOG_LEVEL=info
NODE_ENV=development
MAX_UPLOAD_SIZE_MB=100
```

## Acceptance

```sh
pnpm orbit:dev
# in another terminal
curl localhost:3004/healthz   # → {"ok":true}
curl localhost:3004/readyz    # → {"ok":true,"appsDir":"/Users/.../apps","freeMb":<n>}
```

`pnpm orbit:test` passes (empty suite is fine for this milestone — no tests yet).

## Out of scope (later tasks)

- HMAC middleware → [[orbit-hmac-middleware]]
- Zip extraction → [[orbit-zip-streaming-extraction]]
- Upload route → [[orbit-upload-route]]

## References

- `apps/blaze/` — copy the scaffold shape, including `.env.example`, `vitest.config.ts`, `tsconfig.json`
- `docs/adr/007-deployment-service.md` §4, §10 — what Orbit will eventually do
