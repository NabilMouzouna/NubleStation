# AppBase

Self-hosted backend infrastructure for small organizations.

> 🚧 Final-year project under active development.

## Quick start

Coming soon — see `scripts/install.sh`.

## Repository structure

- `apps/` — services that become Docker containers (API, Console, mDNS announcer)
- `packages/` — npm-publishable libraries (SDK, CLI, shared types)
- `infra/` — infrastructure config (docker-compose, Caddy, CoreDNS)
- `scripts/` — automation (install script)
- `docs/adr/` — architecture decision records

## Development

\`\`\`bash
pnpm install
pnpm dev
\`\`\`