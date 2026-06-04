# DNS Doctor (`scripts/dns-doctor.sh`)

Diagnoses and repairs the full `*.{ORG_DOMAIN}.local` DNS stack on a NubleStation
host. Replaces the older `configure-dns.sh`.

## Why it exists

`*.{org}.local` resolution depends on **three** things staying in agreement:

| Source of truth | Who it serves | Set by |
|---|---|---|
| `HOST_IP` in `/var/nuble/.env` | the canonical IP | install.sh / doctor |
| `/etc/hosts` | **this host only** | install.sh / doctor |
| CoreDNS Corefile (`/var/nuble/coredns/Corefile`) | **every other LAN device** (phones, tablets) | install.sh / doctor |

The old `configure-dns.sh` updated `/etc/hosts` and restarted CoreDNS but **never
regenerated the Corefile**. The Corefile keeps the IP baked in at install time, so
after switching networks (e.g. from home wifi to the offline `nublestation LAN`
router where the host is `192.168.1.12`), CoreDNS kept answering the stale install
IP. Phones resolved the name fine but connected to a dead address → "can't reach
console.nuble.local". `/etc/hosts` and the Corefile had silently drifted apart, and
phones only ever see the Corefile.

DNS Doctor keeps all three in sync and reports drift, including a warning when the
target IP differs from the machine's live interface address.

## Usage

```sh
scripts/dns-doctor.sh [IP]          # diagnose + auto-fix (default)
scripts/dns-doctor.sh --check [IP]  # diagnose only, read-only — changes nothing
scripts/dns-doctor.sh --help
```

- **IP policy is explicit.** Uses the `IP` argument if given, otherwise `HOST_IP`
  from `.env`. The live interface IP is detected only for drift warnings — it never
  silently overwrites your choice (so pre-configuring `.12` for another router while
  connected to a different network is supported).
- **Default is auto-fix**; `--check` is the read-only diagnostic mode.
- Idempotent — safe to re-run.

### Typical workflow

```sh
# On the offline nublestation LAN router (host reserved at .12):
scripts/dns-doctor.sh 192.168.1.12     # syncs .env, /etc/hosts, Corefile → .12

# Switched to a different network and unsure of state:
scripts/dns-doctor.sh --check          # report only
```

## What it checks (diagnosis, read-only)

1. Target IP vs the machine's **live** LAN IP (catches "wrong network" mistakes).
2. `.env` `HOST_IP` vs target.
3. `/etc/hosts` entry for `console.{org}.local` vs target.
4. CoreDNS Corefile answer IP vs target — *what phones receive*.
5. `systemd-resolved` not squatting on port 53.
6. `nsswitch.conf` free of the `mdns4_minimal [NOTFOUND=return]` trap.
7. `/etc/resolv.conf` points at `127.0.0.1` (CoreDNS).
8. CoreDNS container is running.
9. Live assertion: `dig @127.0.0.1 console.{org}.local` answer equals the target IP.

## What it fixes (default mode)

- Disables `systemd-resolved` if it holds port 53.
- Sets `NetworkManager` `dns=none` and writes `/etc/resolv.conf` (`127.0.0.1` +
  `8.8.8.8` fallback), making it immutable via `chattr`.
- Removes the `nsswitch.conf` mDNS trap.
- Rewrites the `*.local` entries in `/etc/hosts` to the target IP.
- **Regenerates the Corefile** from `infra/coredns/Corefile.template` (inline
  fallback if the template isn't found) — the step the old script missed.
- Persists the target IP to `.env` `HOST_IP`.
- Restarts CoreDNS so it reloads the Corefile (CoreDNS reads config only at start).
- Verifies resolution and upstream forwarding.

## Other devices (phones/tablets)

A host can only configure itself. For other devices to resolve `*.{org}.local`,
their DNS must point at this host's IP:

- **Whole network:** router DHCP DNS (option 6) = host IP; ensure a DHCP
  reservation locks the host to that IP by MAC.
- **Per-device:** set the device's Wi-Fi DNS manually to the host IP.

The script prints these instructions at the end of every run.

## Migration

`configure-dns.sh` is now a thin deprecation shim that forwards to `dns-doctor.sh`.
Existing references keep working; new usage should call `dns-doctor.sh`.
