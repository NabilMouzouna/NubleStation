# NubleStation

**Self-hosted backend infrastructure for small organizations.**  
One command turns any Linux machine into a private cloud — shared database, file storage, frontend hosting, and an admin console, all on your LAN.

---

## Get started

### Requirements

- Linux machine on your LAN (Ubuntu 22.04+ recommended)
- `sudo` access
- Ports `80`, `443`, and `53` free on the host

### Install

```bash
curl -sSL https://github.com/NabilMouzouna/NubleStation/releases/latest/download/install.sh | bash
```

The installer will:

1. Install Docker if not already present
2. Ask for your **organization name** (e.g. `clinic`) — this becomes your domain root (`clinic.local`)
3. Ask for your **super admin email and password**
4. Generate secrets, start all services, and wait for them to be healthy

When it finishes:

```
╔══════════════════════════════════════════╗
║       NubleStation is ready!             ║
╚══════════════════════════════════════════╝

  Console  →  http://console.clinic.local
  API      →  http://api.clinic.local
  Admin    →  admin@clinic.com
```

### Network setup

Every device on the LAN needs to resolve `*.clinic.local` to the host IP. Point your router's DNS server to the host — the installer prints the IP. For a single machine during testing, `/etc/hosts` is updated automatically.

### Deploy your first app

Install the CLI:

```bash
npm install -g @nublestation/cli
```

In the Console, create an app and copy its API key. Then from your project directory:

```bash
nuble init --url http://api.clinic.local --slug my-app --key nbl_<keyId>.<secret>
npm run build
nuble deploy
```

Your app is live at `http://my-app.clinic.local`.

---

## Re-running the installer

Running the script again on an already-installed machine shows a menu:

```
[1] Upgrade to <version>
[2] Reset super admin password
[3] Reinstall
[4] Exit
```

---

## Services

### Orbit — Frontend deployment

Orbit stores and serves static frontend bundles. When you run `nuble deploy`, the CLI zips your `dist/` folder and uploads it to Orbit via the Gateway. Orbit extracts it to `/var/nuble/apps/<slug>/current/` and Caddy serves it immediately — no container restart needed.

**Endpoints (internal, accessed via Gateway):**

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v1/orbit/deploy` | Upload a zip bundle for an app |
| `POST` | `/v1/orbit/rollback` | Swap current ↔ previous version |
| `GET` | `/healthz` | Liveness probe |
| `GET` | `/readyz` | Readiness probe (checks storage is writable) |

Both deploy and rollback require a Gateway-signed HMAC header — the CLI handles this automatically.

**Storage layout on the host:**

```
/var/nuble/apps/
  my-app/
    current/       ← live version (served by Caddy at my-app.clinic.local)
    previous/      ← last version (restored on rollback)
```

---

### Gateway — _coming soon_

### Blaze (Database) — _coming soon_

### Identity (Auth) — _coming soon_

### Vault (Storage) — _coming soon_

---

## Repository structure

```
apps/        services that run as Docker containers
packages/    npm-publishable libraries (CLI, SDK, shared types)
infra/       Docker Compose, Caddy, CoreDNS config
scripts/     install.sh
docs/        architecture decision records and documentation
```

## Development

```bash
pnpm install
pnpm dev
```
