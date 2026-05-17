# Troubleshooting

Real issues hit during install/dev with the fix that resolved each. Add new entries here as they come up — symptom first, then root cause, then the exact command(s) to fix.

---

## CoreDNS

### Symptom: container in restart loop, logs say `error inspecting server blocks: zone is not a valid domain name:` (trailing colon, nothing after)

Two distinct causes produce this *identical* error message — check both:

**Cause A — `template` plugin without an explicit zone, combined with `:53` on the server block.**
When `template IN A {` has no positional zone, CoreDNS falls back to the server-block key (e.g. `ensa.local:53`). The `:53` suffix fails domain-name validation; CoreDNS strips the port before printing, leaving the empty trailing colon.

Fix: pass the zone to `template` explicitly.

```corefile
${ORG_NAME}.local:53 {
    template IN A ${ORG_NAME}.local {   # <- zone here, not omitted
        answer "{{ .Name }} 60 IN A ${HOST_IP}"
    }
    ...
}
```

**Cause B — `. :53 {` with a space between `.` and `:53`.**
CoreDNS parses `.` and `:53` as two separate tokens; the validator then sees `:53` standalone and rejects it.

Fix: no space — `.:53 {` (or just `. {`; 53 is the default).

```corefile
.:53 {                   # correct
    forward . 8.8.8.8 1.1.1.1
    ...
}
```

Quick check on a running container:
```bash
docker compose -f infra/docker-compose.yml logs coredns --tail 20
grep -n '^\.' infra/coredns/Corefile     # second block header — should be ".:53 {" exactly
```

---

### Symptom: `coredns/Corefile` is a directory, not a file (`ls -la` shows `drwxr-xr-x ... Corefile`)

Cause: Docker's bind-mount auto-creation. `docker-compose.yml` mounts `./coredns/Corefile:/Corefile:ro`. If the host path doesn't exist when the container starts, Docker creates it — and because the mount target is a path with no trailing `/`, Docker still creates a **directory**. CoreDNS then mounts an empty folder as its config and crashes.

This bites if `install.sh` ever exits before the `envsubst` step succeeds, or if someone deletes `coredns/Corefile` while containers are up.

Fix:
```bash
docker compose -f infra/docker-compose.yml down
rm -rf infra/coredns/Corefile
./scripts/install.sh         # regenerates Corefile from template
```

---

### Symptom: garbled parser errors, or values look correct but CoreDNS still rejects them

Cause: CRLF line endings in `Corefile.template` (from editing on Windows). After `envsubst`, the trailing `\r` becomes part of the zone name (`ensa.local:53\r`), which is invalid.

`install.sh` strips CR with `tr -d '\r'` in the envsubst pipeline, but if you regenerate the Corefile manually, do the same:

```bash
set -a; source infra/.env; set +a
envsubst < infra/coredns/Corefile.template | tr -d '\r' > infra/coredns/Corefile
docker compose -f infra/docker-compose.yml restart coredns
```

Inspect:
```bash
file infra/coredns/Corefile             # expect "ASCII text" with no "CRLF"
od -c infra/coredns/Corefile | head     # \n only, no \r\n
```

---

### Verifying DNS actually works

From the host:
```bash
dig @127.0.0.1 console.${ORG_NAME}.local +short
# should print the HOST_IP
```

From another LAN device (after router DNS is pointed at the host):
```bash
nslookup console.${ORG_NAME}.local
```

---

## install.sh

### Symptom: re-running `install.sh` and Postgres now refuses connections / health check fails

Cause: `install.sh` regenerates a random `POSTGRES_PASSWORD` on every run and writes it to `infra/.env`. But the `postgres-data` volume preserves the *original* password baked into the data directory on first init. Postgres ignores the new env var and keeps using the old password — the rest of the stack uses the new one. Auth mismatch → connection failures.

Fix options (pick one):

- **Throw away the data** (correct in dev/staging): `docker compose -f infra/docker-compose.yml down -v` before re-running install. The `-v` removes named volumes, including `postgres-data`.
- **Preserve the data**: before re-running install, read the old password from the volume and pin it. Easiest is to keep `infra/.env` intact and skip `install.sh` — just run `docker compose up -d`.

### Symptom: `install.sh` exits early or weird parse errors on Linux

Cause: file has CRLF line endings from a Windows editor.

Fix:
```bash
sed -i 's/\r$//' scripts/install.sh
# or:
dos2unix scripts/install.sh
```

### Symptom: `/etc/hosts already has <org>.local — skipping` even when the entry is stale

Cause: `install.sh`'s check is a coarse `grep -q "$ORG_NAME.local"` — any pre-existing line matching that substring (including from a previous botched install) blocks the new entry.

Fix: clean the line manually before re-running install.

```bash
sudo sed -i "/${ORG_NAME}\.local/d" /etc/hosts
```

---

## Docker / Compose

### Symptom: `pull access denied for nublestation/console, repository does not exist or may require 'docker login'` followed by a successful build

Not fatal — Compose tried to pull the named image, fell back to building locally. It costs ~1 second of noise per `up`.

Fix is already applied in `infra/docker-compose.yml`:
```yaml
console:
    build: ...
    image: nublestation/console:dev
    pull_policy: never              # tells Compose: don't pull, just build
```

If you ever publish the image to a registry, switch `pull_policy` back to `missing` (default) or `always`.

### Symptom: console build fails with `failed to compute cache key: "/repo/apps/console/public": not found`

Cause: `apps/console/public/` exists locally but is empty, so git doesn't track it, so it doesn't exist on a fresh clone. The Dockerfile's `COPY ... public ./apps/console/public` then can't find the source.

Fix: keep `apps/console/public/.gitkeep` committed. (Already done.) Same pattern applies to any folder that's expected to exist but might be empty in dev.

---

## WSL2 (development only)

WSL2 is fine for editing and running tests, but **don't trust it for LAN behavior**:

- `hostname -I` returns the WSL VM's NAT'd IP (172.x), not the Windows host's LAN IP. `install.sh` works around this by calling PowerShell — but the underlying limitation remains: WSL is not on your LAN.
- Port 53/UDP exposed through Docker Desktop on Windows is unreliable for LAN access — other devices often can't reach CoreDNS even when the right IP is configured.
- `/etc/hosts` edits inside WSL only affect the WSL VM. To reach `console.{org}.local` from a Windows browser, also edit `C:\Windows\System32\drivers\etc\hosts`.

For real LAN testing, use a native Linux host (VM with bridged networking, or bare metal). The staging Ubuntu VM is the right environment.
