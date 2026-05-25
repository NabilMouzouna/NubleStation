# Fix Port 53 Conflict on Ubuntu (systemd-resolved vs CoreDNS)

## Problem

On Ubuntu (20.04, 22.04, 24.04), `systemd-resolved` runs a local DNS stub listener bound to `127.0.0.53:53`. When the NubleStation stack starts, Docker tries to bind CoreDNS to `0.0.0.0:53` — the same port. The bind fails and the CoreDNS container exits immediately with:

```
bind: address already in use
```

## Diagnosis

Check whether port 53 is already held:

```bash
sudo ss -ulpn | grep ':53'
```

If `systemd-resolved` is the culprit, you will see a line like:

```
UNCONN 0 0 127.0.0.53%lo:53   0.0.0.0:*   users:(("systemd-resolve",pid=642,fd=18))
```

You can also confirm via the CoreDNS container logs:

```bash
docker compose --env-file /var/nuble/.env -f infra/docker-compose.yml logs coredns --tail 20
```

## Fix

**Step 1 — disable systemd-resolved:**

```bash
sudo systemctl disable --now systemd-resolved
```

**Step 2 — replace the stub resolv.conf with a real one:**

Ubuntu's `/etc/resolv.conf` is a symlink to the stub file managed by `systemd-resolved`. After disabling it, the symlink becomes dangling. Replace it:

```bash
sudo rm /etc/resolv.conf
echo "nameserver 8.8.8.8" | sudo tee /etc/resolv.conf
```

This gives the host machine itself a working upstream resolver. Use `1.1.1.1` instead if preferred.

**Step 3 — start (or restart) CoreDNS:**

```bash
docker compose --env-file /var/nuble/.env -f infra/docker-compose.yml up -d coredns
```

**Step 4 — verify CoreDNS is binding correctly:**

```bash
sudo ss -ulpn | grep ':53'
# should now show the docker-proxy process, not systemd-resolve

dig @127.0.0.1 console.${ORG_DOMAIN}.local +short
# should return HOST_IP
```

## Optional: point the host at CoreDNS

Once CoreDNS is running, you can make the host itself use it for `*.{org}.local` resolution without touching `/etc/hosts`:

```bash
printf "nameserver 127.0.0.1\nnameserver 8.8.8.8\n" | sudo tee /etc/resolv.conf
```

CoreDNS forwards all non-`.local` queries upstream (`8.8.8.8`, `1.1.1.1`) so general internet DNS keeps working.

## Why this only affects Ubuntu

Most Linux distributions do not enable `systemd-resolved` by default. Ubuntu has enabled it since 17.10. Other affected distros include Pop!_OS, elementary OS, and Ubuntu-based Linux Mint. Fedora and Arch use different DNS managers and are generally unaffected.

On the staging Ubuntu machine this fix is required before `install.sh` can bring the full stack up successfully.
