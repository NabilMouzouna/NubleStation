---
title: DNS Doctor
description: Diagnose and repair the full *.{org}.local DNS stack on a NubleStation host.
---

`dns-doctor.sh` diagnoses and repairs the entire `*.{org}.local` DNS stack on a
NubleStation host. It is the single tool to reach for whenever a device can resolve
a name but can't reach it, or can't resolve `*.{org}.local` at all.

## Why it exists

`*.{org}.local` resolution depends on **three** sources of truth staying in agreement:

| Source of truth | Who it serves | Set by |
|---|---|---|
| `HOST_IP` in `/var/nuble/.env` | the canonical IP | install.sh / doctor |
| `/etc/hosts` | **this host only** | install.sh / doctor |
| CoreDNS Corefile (`/var/nuble/coredns/Corefile`) | **every other LAN device** (phones, tablets) | install.sh / doctor |

The most common failure: the host switches networks (e.g. from home Wi-Fi to the
offline NubleStation LAN router where the host is `192.168.1.12`), but the Corefile
keeps the IP baked in at install time. Phones resolve the name fine, then connect to
a dead address — "can't reach `console.nuble.local`". The Corefile and `/etc/hosts`
have silently drifted, and phones only ever see the Corefile.

DNS Doctor keeps all three in sync, reports drift, and warns when the target IP
differs from the machine's live interface address.

## Usage

```sh
scripts/dns-doctor.sh [IP]          # diagnose + auto-fix (default)
scripts/dns-doctor.sh --check [IP]  # diagnose only, read-only — changes nothing
scripts/dns-doctor.sh --help
```

- **IP policy is explicit.** Uses the `IP` argument if given, otherwise `HOST_IP`
  from `.env`. The live interface IP is detected only for drift warnings — it never
  silently overwrites your choice, so pre-configuring `.12` for another router while
  connected to a different network is supported.
- **Default is auto-fix**; `--check` is the read-only diagnostic mode.
- Idempotent — safe to re-run.

### Typical workflow

```sh
# On the offline NubleStation LAN router (host reserved at .12):
scripts/dns-doctor.sh 192.168.1.12     # syncs .env, /etc/hosts, Corefile → .12

# Switched to a different network and unsure of state:
scripts/dns-doctor.sh --check          # report only
```

## What it checks (read-only diagnosis)

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
- Sets NetworkManager `dns=none` and writes `/etc/resolv.conf` (`127.0.0.1` +
  `8.8.8.8` fallback), making it immutable via `chattr`.
- Removes the `nsswitch.conf` mDNS trap.
- Rewrites the `*.local` entries in `/etc/hosts` to the target IP.
- **Regenerates the Corefile** from `infra/coredns/Corefile.template` (inline
  fallback if the template isn't found) — the step the old `configure-dns.sh` missed.
- Persists the target IP to `.env` `HOST_IP`.
- Restarts CoreDNS so it reloads the Corefile (CoreDNS reads config only at start).
- Verifies resolution and upstream forwarding.

## Other devices (phones / tablets)

A host can only configure itself. For other devices to resolve `*.{org}.local`,
their DNS must point at this host's IP:

- **Whole network:** router DHCP DNS (option 6) = host IP; add a DHCP reservation
  that locks the host to that IP by MAC.
- **Per-device:** set the device's Wi-Fi DNS manually to the host IP.

The script prints these instructions at the end of every run.

<Aside type="tip">
  `configure-dns.sh` is now a thin deprecation shim that forwards to `dns-doctor.sh`.
  Existing references keep working; new usage should call `dns-doctor.sh`.
</Aside>
