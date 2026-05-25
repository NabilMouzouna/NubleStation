---
title: Installation
description: How to install NubleStation on a Linux machine in under ten minutes.
---

import { Aside, Steps, Tabs, TabItem } from '@astrojs/starlight/components';

## Prerequisites

| Requirement | Details |
|---|---|
| **OS** | Linux (Ubuntu 22.04 LTS recommended). macOS is supported for development only. |
| **Docker** | Docker Engine 24+ and Docker Compose v2 |
| **RAM** | 2 GB minimum, 4 GB recommended |
| **Disk** | 10 GB free for services + data |
| **Network** | A static LAN IP (or a DHCP reservation on your router) |
| **DNS** | Ability to configure your router's DNS server, or edit `/etc/hosts` per device |

<Aside type="tip">
  Lock the host machine's IP to its MAC address on your router (DHCP reservation). NubleStation bakes this IP into the DNS config — if the IP changes, DNS breaks until you re-run the installer.
</Aside>

## One-command install

```bash
curl -sSL https://raw.githubusercontent.com/nabilmouzouna/nublestation/main/scripts/install.sh | bash
```

The installer will ask you two questions:

1. **Organization name** — becomes the subdomain root (e.g., `clinic` → `*.clinic.local`)
2. **Admin password** — used to log into `console.clinic.local`

It then:

<Steps>
1. Detects your host's LAN IP
2. Writes `infra/.env` with all generated secrets
3. Renders `Corefile` and `Caddyfile` from templates
4. Starts the full Docker Compose stack
5. Prints the console URL
</Steps>

```
✅ NubleStation is running.

   Console  →  http://console.clinic.local
   API      →  http://api.clinic.local

   Point your devices' DNS at: 192.168.1.100
```

## DNS setup (required for all devices)

CoreDNS runs on the host and is the authority for `*.{org}.local`. **Every device that needs to reach NubleStation must use the host as its DNS resolver.**

<Tabs>
  <TabItem label="Router (recommended)">
    Log into your router admin panel. Under **DHCP / DNS settings**, set the primary DNS server to your NubleStation host's IP (e.g., `192.168.1.100`).

    All devices on the network will automatically use CoreDNS after their DHCP lease renews.
  </TabItem>
  <TabItem label="Per device (fallback)">
    Edit `/etc/hosts` on each device:

    ```
    192.168.1.100  console.clinic.local
    192.168.1.100  api.clinic.local
    192.168.1.100  tasks.clinic.local
    ```

    This works for testing but doesn't scale — you must add a line for every app subdomain.
  </TabItem>
  <TabItem label="Windows">
    Edit `C:\Windows\System32\drivers\etc\hosts` as Administrator:

    ```
    192.168.1.100  console.clinic.local
    192.168.1.100  api.clinic.local
    ```

    Or configure the DNS server in **Network Adapter Settings → IPv4 → Preferred DNS**.
  </TabItem>
</Tabs>

## Verify the installation

From the host machine:

```bash
# DNS resolves correctly
dig @127.0.0.1 console.clinic.local +short
# → 192.168.1.100

# All containers are healthy
docker compose -f infra/docker-compose.yml ps
```

All services should show `healthy` or `running`. Open `http://console.clinic.local` in a browser — you should see the NubleStation console login.

## Re-running the installer

<Aside type="caution">
  The installer generates a new `POSTGRES_PASSWORD` each run. If PostgreSQL data already exists (the `postgres-data` volume), the new password won't match the one baked into the data directory, causing connection failures.

  To reinstall cleanly:
  ```bash
  docker compose -f infra/docker-compose.yml down -v   # removes volumes!
  curl -sSL .../install.sh | bash
  ```

  To preserve data, keep `infra/.env` intact and run `docker compose up -d` instead of re-running the installer.
</Aside>

## Manual setup (development)

If you're contributing to NubleStation or running services locally without Docker:

```bash
git clone https://github.com/nabilmouzouna/nublestation
cd nublestation
pnpm install

# Copy and fill in environment variables
cp apps/db/.env.example apps/db/.env
cp apps/gateway/.env.example apps/gateway/.env

# Start a local Postgres (must be running)
pnpm db:migrate

# Start services
pnpm db:dev        # database service on :3001
pnpm gateway:dev   # API gateway on :3000
```

See the [Troubleshooting](/reference/troubleshooting/) page for common installation issues.
