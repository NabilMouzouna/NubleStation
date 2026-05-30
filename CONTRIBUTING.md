# Contributing to NubleStation

## Prerequisites

- Node.js 22+
- pnpm 9+
- Docker + Docker Compose
- A running Postgres instance (or use the compose stack)

```sh
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run a specific service in dev mode
pnpm --filter @nublestation/blaze dev
```

---

## Branch workflow

```
feature/* → dev → staging → main
```

| Branch | Purpose | Triggers |
|---|---|---|
| `feature/*` | Short-lived work | Nothing |
| `dev` | Daily integration | CI (lint, type-check, test) |
| `staging` | Pre-release | CI + Docker image build (`:staging` tag) |
| `main` | Release | CI + Docker push (`:latest`) + npm publish + GitHub Release |

**Never push directly to `main`.** Always go `dev → staging → main` or `staging → main`.

---

## Commit messages

```
<type>: <short description>          # subject line — max 72 chars
```

Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`

```sh
feat: add public file serving to Vault
fix: pass orgDomain prop to SettingsTab
docs: extend service-contract with Console trust path
```

No AI signatures, no emoji prefixes, no "Co-authored-by" footers.

---

## Adding a new service

NubleStation services all follow the same contract. Before writing any code, read:

- [`docs/documentation/service-contract.md`](docs/documentation/service-contract.md) — the full contract with checklist
- [`docs/adr/009-service-plug-and-play-contract.md`](docs/adr/009-service-plug-and-play-contract.md) — the decision record

### Summary of mandatory rules

1. **No `ports:` in docker-compose** — `expose:` only. Only Gateway has host-mapped ports.
2. **`INTERNAL_HMAC_SECRET` required at boot** — fail fast in `config.ts` via Zod.
3. **`/healthz` and `/readyz` before any auth middleware** — Docker Compose probes these without credentials.
4. **`hmacAuth` on `/v1/*` before all business routes** — import from `@nublestation/shared`, never reimplement.
5. **Read `c.var.appId` / `c.var.userId`, never raw headers** — these values are HMAC-verified.
6. **Register in Gateway** — add `{CODENAME}_INTERNAL_URL` to gateway config and one entry to the service registry.
7. **Routes under `/v1/{codename}/*`** — the canonical path shape.

### If your service has public (unauthenticated) endpoints

Register a separate prefix in Gateway (not under `/v1/`). Apply no HMAC middleware on that prefix. Enforce access at the application level (e.g. an `is_public` column). See [Public endpoints](docs/documentation/service-contract.md#public-endpoints--unauthenticated-read-only) in the contract.

### If your service is admin-managed from Console

Add `{CODENAME}_INTERNAL_URL` to Console's env in `docker-compose.yml`. Console signs requests directly using `INTERNAL_HMAC_SECRET` — no API key needed. See [Admin trust path](docs/documentation/service-contract.md#part-3--the-admin-trust-path-console--service) in the contract.

---

## Architecture decisions

All significant choices are documented in [`docs/adr/`](docs/adr/). When your change introduces a non-obvious trade-off, write an ADR. Format: `0XX-short-title.md`, status `Accepted`, 3–5 paragraphs max.

---

## Project rules

See [`RULES.md`](RULES.md) for scope, git, and documentation requirements that apply to all changes.
