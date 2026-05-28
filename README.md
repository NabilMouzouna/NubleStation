<div align="center">
  <img src="packages/assets/icon.svg" height="72" alt="NubleStation" />
  <h1>NubleStation</h1>
  <p><strong>Self-hosted backend infrastructure for small organizations.</strong><br/>
  One command turns any Linux machine into a private cloud — no internet dependency, no cloud bills.</p>

  <p>
    <a href="https://www.npmjs.com/package/@nublestation/cli">
      <img src="https://img.shields.io/npm/v/%40nublestation%2Fcli?style=flat-square&label=CLI&color=6d28d9" alt="npm" />
    </a>
    <a href="https://github.com/NabilMouzouna/NubleStation/pkgs/container/nublestation-console">
      <img src="https://img.shields.io/badge/container-ghcr.io-0ea5e9?style=flat-square&logo=docker&logoColor=white" alt="Docker" />
    </a>
    <a href="https://github.com/NabilMouzouna/NubleStation/releases/latest">
      <img src="https://img.shields.io/github/v/release/NabilMouzouna/NubleStation?style=flat-square&color=22c55e&label=release" alt="Release" />
    </a>
    <a href="https://nabilmouzouna.github.io/NubleStation">
      <img src="https://img.shields.io/badge/docs-live-6d28d9?style=flat-square" alt="Docs" />
    </a>
  </p>
</div>

---

## Services

<table>
  <tr>
    <td align="center" width="20%">
      <img src="packages/assets/services/orbit.svg" height="52" alt="Orbit" /><br/>
      <b>Orbit</b><br/>
      <sub>Frontend deploy</sub>
    </td>
    <td align="center" width="20%">
      <img src="packages/assets/services/blaze.svg" height="52" alt="Blaze" /><br/>
      <b>Blaze</b><br/>
      <sub>Database</sub>
    </td>
    <td align="center" width="20%">
      <img src="packages/assets/services/identity.svg" height="52" alt="Identity" /><br/>
      <b>Identity</b><br/>
      <sub>Auth &amp; SSO</sub>
    </td>
    <td align="center" width="20%">
      <img src="packages/assets/services/vault.svg" height="52" alt="Vault" /><br/>
      <b>Vault</b><br/>
      <sub>File storage</sub>
    </td>
    <td align="center" width="20%">
      <img src="packages/assets/icon.svg" height="52" alt="Gateway" /><br/>
      <b>Gateway</b><br/>
      <sub>API routing</sub>
    </td>
  </tr>
</table>

---

## Get started

### Requirements

| | |
|---|---|
| **OS** | Linux — Ubuntu 22.04+ recommended |
| **Ports** | `80`, `443`, `53` free on the host |
| **Access** | `sudo` |

### Install

```bash
curl -sSL https://github.com/NabilMouzouna/NubleStation/releases/latest/download/install.sh | bash
```

The installer asks four questions — org name, description, admin email, admin password — then starts every service and prints your console URL.

```
╔══════════════════════════════════════════╗
║       NubleStation is ready!             ║
╚══════════════════════════════════════════╝

  Console  →  http://console.clinic.local
  API      →  http://api.clinic.local
  Admin    →  admin@clinic.com

  Router DNS → point to 192.168.1.100
```

### Network setup

Every device on the LAN must use the host as its DNS server. Set the primary DNS in your router to the host IP — all `*.clinic.local` subdomains resolve automatically. For a single machine, `/etc/hosts` is updated by the installer.

### Deploy your first app

```bash
# 1. Install the CLI
npm install -g @nublestation/cli

# 2. Create an app in the Console, copy its API key, then:
nuble init --url http://api.clinic.local --slug my-app --key nbl_<keyId>.<secret>

# 3. Build and deploy
npm run build
nuble deploy
# → live at http://my-app.clinic.local
```

---

## Re-running the installer

```
[1] Upgrade to <version>
[2] Reset super admin password
[3] Reinstall
[4] Exit
```

Existing secrets are reused on upgrade — your data is safe.

---

## How it works

```
Install                          Deploy
─────────────────────            ──────────────────────────────────────
curl install.sh | bash           nuble deploy
 → Docker + CoreDNS + Caddy       → zips dist/
 → PostgreSQL (platform schema)   → POST /v1/orbit/deploy (HMAC-signed)
 → Console seeds org + admin      → Gateway → Orbit extracts bundle
 → *.clinic.local resolves        → Caddy serves my-app.clinic.local
```

---

## Repository structure

```
apps/
  gateway/     API entry point — the only LAN-exposed service
  console/     Next.js admin dashboard
  orbit/       Frontend deploy service
  blaze/       Database service (Postgres + RLS)
  identity/    Auth service — coming soon
  vault/       File storage — coming soon
packages/
  cli/         @nublestation/cli — nuble init · deploy · status
  ui/          Shared component library
infra/
  docker-compose.yml
  caddy/Caddyfile
  coredns/Corefile.template
scripts/
  install.sh
docs/          Architecture decision records + documentation site
```

## Development

```bash
git clone https://github.com/NabilMouzouna/NubleStation
cd NubleStation
pnpm install
pnpm dev
```

Full documentation → **[nabilmouzouna.github.io/NubleStation](https://nabilmouzouna.github.io/NubleStation)**
