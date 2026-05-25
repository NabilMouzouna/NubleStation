---
title: Troubleshooting
description: Common issues and exact commands to fix them.
---

import { Aside } from '@astrojs/starlight/components';

## CoreDNS

### Container restart loop — "zone is not a valid domain name"

Two distinct causes produce this identical error message.

**Cause A: `template` plugin without an explicit zone**

When `template IN A {` has no positional zone, CoreDNS falls back to the server-block key (e.g. `clinic.local:53`). The `:53` suffix fails domain-name validation; CoreDNS strips the port before printing, leaving an empty trailing colon.

Fix — pass the zone explicitly:

```text
clinic.local:53 {
    template IN A clinic.local {     # ← zone here
        answer "{{ .Name }} 60 IN A ${HOST_IP}"
    }
}
```

**Cause B: space between `.` and `:53`**

CoreDNS parses `.` and `:53` as two separate tokens.

Fix — no space:

```text
.:53 {                   # correct
    forward . 8.8.8.8 1.1.1.1
}
```

Quick diagnostic:

```bash
docker compose -f infra/docker-compose.yml logs coredns --tail 20
grep -n '^\.' infra/coredns/Corefile     # should print ".:53 {" exactly
```

---

### `Corefile` is a directory, not a file

Cause: Docker's bind-mount auto-creation. If the host path doesn't exist when the container starts, Docker creates it as a **directory** (because the mount target has no trailing `/`). CoreDNS mounts an empty folder as its config and crashes.

```bash
docker compose -f infra/docker-compose.yml down
rm -rf infra/coredns/Corefile
./scripts/install.sh         # regenerates Corefile from template
```

---

### Garbled parser errors / correct-looking values still rejected

Cause: CRLF line endings in `Corefile.template` (from Windows editors). After `envsubst`, the trailing `\r` becomes part of the zone name.

```bash
# Check for CRLF
file infra/coredns/Corefile             # should say "ASCII text" not "CRLF"
od -c infra/coredns/Corefile | head     # \n only, no \r\n

# Strip CR and regenerate
set -a; source infra/.env; set +a
envsubst < infra/coredns/Corefile.template | tr -d '\r' > infra/coredns/Corefile
docker compose -f infra/docker-compose.yml restart coredns
```

---

### Verifying DNS works

```bash
# From the host
dig @127.0.0.1 console.clinic.local +short
# should print the HOST_IP

# From another LAN device (after pointing DNS at host)
nslookup console.clinic.local
```

---

## install.sh

### Postgres refuses connections after re-running install

Cause: the installer generates a new `POSTGRES_PASSWORD` on every run. The `postgres-data` volume preserves the original password baked into the data directory. Postgres ignores the new env var — auth mismatch causes connection failures.

Fix options:

```bash
# Option 1 — throw away data (correct in dev/staging)
docker compose -f infra/docker-compose.yml down -v
./scripts/install.sh

# Option 2 — preserve data
# Keep infra/.env intact, don't re-run install
docker compose -f infra/docker-compose.yml up -d
```

---

### install.sh exits with parse errors on Linux

Cause: CRLF line endings from Windows editing.

```bash
sed -i 's/\r$//' scripts/install.sh
# or
dos2unix scripts/install.sh
```

---

### `/etc/hosts already has org.local — skipping` on stale entry

Cause: the install script's check is a coarse `grep` — any pre-existing line matching the org name blocks the new entry.

```bash
sudo sed -i "/${ORG_NAME}\.local/d" /etc/hosts
./scripts/install.sh
```

---

## Docker / Compose

### `pull access denied for nublestation/console` followed by a successful build

Not fatal. Compose tried to pull the named image, fell back to building locally. The `pull_policy: never` directive in `infra/docker-compose.yml` eliminates the noise — this is already set.

---

### Console build fails with `"/repo/apps/console/public": not found`

Cause: `apps/console/public/` is empty — git doesn't track empty directories, so it doesn't exist on a fresh clone. The Dockerfile's `COPY ... public` fails.

Fix: `apps/console/public/.gitkeep` must be committed. Check that it exists:

```bash
ls apps/console/public/.gitkeep
```

If missing, create and commit it:

```bash
touch apps/console/public/.gitkeep
git add apps/console/public/.gitkeep
git commit -m "fix: track empty public directory"
```

---

## WSL2 (development only)

<Aside type="caution">
  WSL2 is fine for editing and running tests but is **not reliable for LAN behavior testing**.
</Aside>

- `hostname -I` returns the WSL VM's NAT'd IP (`172.x`), not the Windows host's LAN IP. The installer works around this by calling PowerShell, but WSL is not on your LAN.
- Port 53/UDP through Docker Desktop on Windows is unreliable — other LAN devices often can't reach CoreDNS even with the correct IP configured.
- `/etc/hosts` edits inside WSL only affect the WSL VM. To reach `console.clinic.local` from a Windows browser, also edit `C:\Windows\System32\drivers\etc\hosts`.

**For real LAN testing:** use a native Linux host — a VM with bridged networking or bare metal. The staging Ubuntu VM is the correct environment.

---

## General diagnostic commands

```bash
# Status of all containers
docker compose -f infra/docker-compose.yml ps

# Logs for a specific service
docker compose -f infra/docker-compose.yml logs <service> --follow

# Restart a single service
docker compose -f infra/docker-compose.yml restart <service>

# Full restart (preserves volumes)
docker compose -f infra/docker-compose.yml down && docker compose -f infra/docker-compose.yml up -d

# Nuclear restart (deletes all data)
docker compose -f infra/docker-compose.yml down -v && docker compose -f infra/docker-compose.yml up -d
```
