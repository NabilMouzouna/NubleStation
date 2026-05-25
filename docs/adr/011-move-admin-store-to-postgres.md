# ADR 011 — Move Console Admin Store from SQLite to PostgreSQL

**Status:** Accepted  
**Date:** 2026-05-25

## Context

The Console used `better-sqlite3` to store admin users and organization data in a file-based `admin.db`. `better-sqlite3` is a native Node.js addon that must be compiled against the exact Node.js ABI and libc version of the runtime. In practice this means:

- Multi-stage Docker builds silently produce a binary that crashes at runtime if the builder and runner images differ even slightly.
- The install script needed `sqlite3` CLI as a host dependency to seed the database, adding a fragile step before Docker is even involved.
- Any ARM or musl-based host requires a full recompile, which is not guaranteed in CI.

These are not edge-case bugs — they are structural: a native addon cannot be reliably bundled in a Docker image that uses a lean runtime stage.

## Decision

Move all admin/organization data (admin users, sessions, organizations) from `admin.db` / `better-sqlite3` into the **PostgreSQL** instance that is already part of the Compose stack. The Console's `PLATFORM_DB_URL` environment variable already points to this instance.

The `pg` driver (pure JavaScript, no native compilation) is already used by other services in the monorepo. Admin tables are added to the `platform` schema alongside the existing Drizzle-managed tables.

The `sqlite3` CLI dependency and `admin.db` seeding steps are removed from `install.sh`. The installer seeds the admin user directly into Postgres after the stack starts, using a one-shot migration/seed that runs inside the `console` container or via `psql`.

## Consequences

- `better-sqlite3` is removed from the Console. No native addon in the image.
- The `admin.db` file and `ADMIN_DB_PATH` env var are gone.
- `sqlite3` is dropped as a host install dependency.
- Admin data is now in the same Postgres instance as platform data — one fewer moving part, one fewer backup target.
- The Console Dockerfile no longer needs build tools (`python3`, `make`, `g++`) for native compilation, producing a smaller image.
- Postgres must be healthy before the Console can start — already enforced by the `depends_on: postgres: condition: service_healthy` in `docker-compose.yml`.
