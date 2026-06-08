# Plan 02 — Finalize & launch

**Status:** Queued (starts after Plan 01 lands on `staging`)
**Date:** 2026-06-06
**End state:** green staging dress-rehearsal; **the 1.0.0 push to `main` is gated on the owner's explicit go** (RULES.md: dev/feature → staging → main, never push main directly).

---

## Why

Once Blaze (Plan 01) lands, NubleStation is feature-complete for the PFE. This plan proves the whole system is secure and correct, rehearses the release on `staging`, and stops at a go-live checklist. The bar is "best standards for pushing a solution live," scoped to a single-host LAN product defended at a viva.

## A. Security testing & review

- Run `/security-review` on the Blaze diff and the system.
- **RLS** — cross-tenant isolation on the production codegen path + auto-REST (extends Plan 01 M4); fail-closed when tenant context is missing.
- **HMAC chain** — forged / missing / expired signature → 401; timestamp replay window enforced.
- **API keys** — revoked / expired rejected; Argon2 verify; key material never logged.
- **Auto-REST injection** — validator allowlist + parameterized-only + quotas; fuzz the filter/JSONB parser; confirm no string-built SQL.
- **Migration validator** — allowlist (no DROP/GRANT/cross-schema), reserved names, checksum drift refusal, advisory lock.
- **Secrets / transport** — no `.env` or secrets committed; `INTERNAL_HMAC_SECRET` strength; session cookie flags (HttpOnly/Secure/SameSite=Lax, `Domain=.{org}.local`); CORS scoped at the gateway; `pnpm audit`; Docker images non-root + minimal.

## B. Integration testing

- E2E through the gateway → Blaze / Identity / Vault / Orbit (Vitest integration suites per service).
- Playwright E2E for the Console (already in stack): login/SSO, app create, Users tab, Database tab.
- Full developer loop: `nuble init` → `nuble db push` → SDK CRUD → `nuble deploy`.
- Cross-service: Console app-create → API key → SDK query; SSO cookie shared across `*.{org}.local`.

## C. Manual / acceptance (defense-day demo flow)

- Fresh Ubuntu VM → `curl … | bash` install → `console.{org}.local` reachable from a second LAN device.
- Create app → subdomain reserved + API key issued; build a SPA with the SDK → `nuble db push` + `nuble deploy` → live at `{app}.{org}.local`.
- **Resilience:** unplug internet → still works; `docker kill` a service → auto-restart (restart policy); host reboot → stack returns.
- **Networking:** CoreDNS resolves `*.{org}.local`; Caddy serves; internal-CA root install verified on a device.
- **Backups:** `pg_dump` + `/var/nuble/` snapshot → restore drill on a clean VM.

## D. Release engineering (best standards)

- **CI** (`ci.yml`) — lint + type-check + test + build on every push; green on `staging` is the gate.
- **Release** (`release.yml`) — on `main`: build/push GHCR images for every service + publish npm (`@nublestation/sdk`, `/cli`, `/schema`) + GitHub Release with notes.
- **Versioning** — bump `0.x` → **1.0.0** for defense.
- **Pre-flight checklist** — green staging CI; install-script smoke test on a clean VM; health/readiness probes; rollback via pinned previous `IMAGE_TAG`; changelog.
- **Observability** — Pino structured logs; optional `prom-client`; `audit_log` coverage for sensitive ops.
- **Docs** — `docs/documentation/` updated (Blaze service, SDK, CLI `db push`, platform-schema), README, changelog.

## E. Gate

Land Plan 01 on `staging` → integrate → run A-D → **stop**. Present the go-live checklist. **The owner triggers `main` (1.0.0).**

## Deliverables

This plan, an expanded test/security report, and the go-live checklist.
