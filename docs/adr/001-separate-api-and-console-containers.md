# ADR 001 — Separate API and Console containers

**Status:** Accepted
**Date:** 2026-05-09

## Context

NubleStation ships two long-running TypeScript services: the **API** (auth/db/storage/deploy modules in one Hono/Fastify process) and the **Console** (Next.js admin dashboard). They could run as one container or two. The single-container option is tempting because the compose file is shorter.

## Decision

Run **two containers** — `api` and `console` — on the same Compose network. They communicate over the internal `nuble` bridge; Caddy routes `console.{org}.local` and `api.{org}.local` to the respective service.

## Rationale

| Concern | Single container | Two containers |
|---|---|---|
| **Restart blast radius** | API crashes → Console also dies | Independent — Console keeps serving even if API restarts |
| **Resource limits** | Can't cap one without the other | Set memory/CPU limits per service |
| **Logs** | Mixed stdout, hard to debug | `docker compose logs api` vs `docker compose logs console` |
| **Scaling future** | Stuck — can't run 2 API instances + 1 Console | Trivial — `deploy: replicas: 2` on API only |
| **Image size** | Console doesn't need Postgres client libs; API doesn't need Next.js build tools | Each image only ships what it needs |
| **Build cache** | Change API code → rebuild Console too | Change API → only API rebuilds (faster CI) |
| **Industry pattern** | Almost no one does this | Standard everywhere (Supabase, Coolify, Plausible all do this) |

The single-container "advantage" is a smaller compose file. That's it. Every other dimension favors splitting them.

## Consequences

- `apps/api/` and `apps/console/` are independent Turborepo workspaces with their own `Dockerfile`.
- Compose defines two services (`api`, `console`); Caddy reverse-proxies each to its subdomain.
- Cross-service calls (Console → API) go via `http://api:80` on the internal network, never through Caddy.
- CI builds two images per release (`nublestation/api`, `nublestation/console`) published to GHCR.

## References

- [Docker — Decouple applications](https://docs.docker.com/build/building/best-practices/#decouple-applications): *"A container should have only one concern. Decoupling applications into multiple containers makes it easier to scale horizontally and reuse containers."*
