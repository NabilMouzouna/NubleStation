# Testing NubleStation on a Single Machine

How to make `*.{org}.local` domains resolve on the **same machine** running NubleStation — no second device, no router DNS change required.

> **As of the latest `install.sh`**, steps 2–4 below are applied automatically during installation. This guide exists for manual troubleshooting and for understanding what the installer does.

Affected systems: Ubuntu 20.04 / 22.04 / 24.04, Pop!\_OS, elementary OS, Linux Mint. Fedora / Arch are generally unaffected.

---

## What blocks `.local` DNS on a fresh Ubuntu machine

Three independent layers all have to be right. Any one of them being wrong silently breaks resolution.

| Layer | Default Ubuntu behavior | Required state |
|---|---|---|
| Port 53 | `systemd-resolved` stub holds it | CoreDNS must own port 53 |
| `/etc/nsswitch.conf` | `mdns4_minimal [NOTFOUND=return]` short-circuits `.local` | Must fall through to `dns` |
| `/etc/hosts` | Stale manual entries shadow CoreDNS | Must be clean / current IP |
| CoreDNS process | Loads config at startup, no auto-reload | Must restart after Corefile changes |

---

## Step 1 — Free port 53 (Ubuntu only)

Ubuntu's `systemd-resolved` binds a stub listener to `127.0.0.53:53`. CoreDNS needs port 53 on all interfaces (`0.0.0.0:53`). They conflict at startup.

Check:

```bash
sudo ss -ulpn | grep ':53'
# if you see "systemd-resolve" → run the fix below
```

Fix:

```bash
sudo systemctl disable --now systemd-resolved
sudo rm /etc/resolv.conf
printf "nameserver 127.0.0.1\nnameserver 8.8.8.8\n" | sudo tee /etc/resolv.conf
```

Then restart CoreDNS so it can now bind:

```bash
docker restart nublestation-coredns-1
```

---

## Step 2 — Remove stale `/etc/hosts` entries

`/etc/hosts` is checked before DNS. Any entry for `{org}.local` in that file wins, even if the IP is wrong (e.g. from a previous install on a different network).

```bash
# Replace ORG_DOMAIN with your org, e.g. "nuble"
sudo sed -i '/{ORG_DOMAIN}\.local/d' /etc/hosts
```

The installer always runs this before writing the fresh entry, so re-running `install.sh` self-heals stale IPs.

---

## Step 3 — Fix the mDNS trap in nsswitch

Ubuntu ships with:

```
hosts: files mdns4_minimal [NOTFOUND=return] dns
```

`[NOTFOUND=return]` means: if mDNS can't find a `.local` name, **stop — never try the `dns` resolver (CoreDNS)**. This silently kills all custom `.local` resolution.

Fix:

```bash
sudo sed -i 's/mdns4_minimal \[NOTFOUND=return\] //' /etc/nsswitch.conf
```

Result:

```
hosts: files dns
```

The installer applies this automatically on Ubuntu systems.

---

## Step 4 — Restart CoreDNS after any Corefile change

CoreDNS reads its Corefile once at startup. Docker bind mounts reflect on-disk changes live, but CoreDNS doesn't watch for them. If `install.sh` regenerated the Corefile (e.g. because the host IP changed), the running container still serves the old config until restarted.

```bash
docker restart nublestation-coredns-1
```

The installer does this automatically when it detects the container is already running.

---

## Verify everything works

```bash
# .local domains resolve to the current host IP
getent hosts console.{ORG_DOMAIN}.local
# expected: 192.168.x.x  console.{ORG_DOMAIN}.local

# CoreDNS also forwards internet queries upstream
host google.com 127.0.0.1
# expected: google.com has address ...
```

---

## Troubleshooting

**`getent` returns the wrong IP after re-running install**

CoreDNS is still serving the old config. Restart it:

```bash
docker restart nublestation-coredns-1
```

**`getent` returns NOTFOUND**

Check nsswitch — the mDNS trap may still be present:

```bash
grep hosts /etc/nsswitch.conf
# should be: hosts: files dns
```

Also confirm CoreDNS is running and healthy:

```bash
docker ps | grep coredns
docker logs nublestation-coredns-1 --tail 20
```

**Port 53 conflict reappears after reboot**

`systemd-resolved` may re-enable on package updates. Check:

```bash
systemctl is-enabled systemd-resolved   # should say "disabled"
```

If re-enabled, repeat Step 1.

**`/etc/hosts` has the right IP but browser still gets the old one**

The browser may have its own DNS cache. Hard-refresh or open a private window. On Chrome: `chrome://net-internals/#dns` → Clear host cache.
