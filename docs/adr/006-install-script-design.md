# ADR 006 — Install Script Design

**Status:** Accepted  
**Date:** 2026-05-20  
**Tags:** infra, install, ux

---

## Context

`install.sh` is the first thing every NubleStation user runs. It is the product's front door — the entire first impression happens here. It must bootstrap a full working platform (SQLite, Docker Compose stack, CoreDNS, Caddy) from a single command, on any mainstream Linux distribution, with no assumptions about what is already installed.

This ADR captures all design decisions for `install.sh`: how it is distributed, what it displays, how it handles errors, and how it behaves on re-runs.

---

## Decisions

### 1. Distribution — `curl | bash` pulling from GitHub Releases

```bash
curl -sSL https://get.nublestation.io/install.sh | bash
```

`install.sh` is a single script. It downloads the rest of the release bundle (docker-compose.yml, Caddyfile, Corefile template, `scripts/seed-admin.sql`) at runtime from the tagged GitHub Release using `curl`. No tarball for the user to manage.

**Bundle structure on GitHub Releases (e.g. `v1.0.0`):**
```
install.sh
docker-compose.yml
scripts/
  seed-admin.sql
infra/
  Caddyfile
  Corefile.template
```

`install.sh` downloads each file individually into a working directory (`/opt/nublestation/` or `/var/nuble/install/`) and proceeds from there.

**Why not a tarball:** A single `curl | bash` is the industry convention (Homebrew, nvm, Docker). Tarballs require the user to extract and navigate — more steps, more friction.

---

### 2. TUI — ANSI-native with whiptail/dialog fallback

The installer uses a **layered TUI strategy**:

**Layer A — ASCII logo + ANSI colors (always shown)**

The NubleStation logo cannot be rendered from SVG in a terminal. Instead, a hand-crafted ANSI ASCII art version is displayed on launch using escape codes. Colors match the brand:
- Logo mark: `\e[38;5;99m` (indigo, closest to `#5F55F0`)
- "Nuble" text: `\e[1m` (bold dark)
- "Station" text: `\e[38;5;245m` (gray, matching `#5C6B7A`)

**Layer B — whiptail/dialog for interactive prompts**

For the interactive prompts (org name, admin email, admin password), the installer uses `whiptail` or `dialog` if available. These provide native TUI input boxes with labels and validation feedback.

Detection order:
```bash
if command -v whiptail >/dev/null 2>&1; then TUI=whiptail
elif command -v dialog >/dev/null 2>&1; then TUI=dialog
else TUI=plain  # fallback: read -p
fi
```

`whiptail` ships by default on Debian/Ubuntu. `dialog` is common on RHEL/Fedora/Arch. The plain `read -p` fallback ensures the script works even on minimal systems with neither.

**Layer C — ANSI spinners + status lines (always shown)**

Steps (downloading files, running Docker, creating DB) display spinners and colored status lines:
```
[✓] Docker found (v27.1.0)
[✓] sqlite3 installed
[→] Pulling Docker images...  (spinner)
[✓] Services started
```

Colors: green `\e[32m` for success, yellow `\e[33m` for in-progress, red `\e[31m` for error.

**Cross-distro compatibility:**
- All ANSI codes are POSIX-compatible
- No `bash`-only features — use `#!/usr/bin/env sh` + POSIX sh syntax for maximum portability
- Tested distros: Ubuntu 22.04+, Debian 12+, Fedora 39+, Arch Linux
- `whiptail`/`dialog` are install-if-missing (apt, dnf, pacman, zypper detected automatically)

---

### 3. Error Recovery — Automatic with Checkpointing

`install.sh` uses a **checkpoint file** at `/var/nuble/.install-checkpoint` to track which steps have completed. On failure, it tries to recover and resume from the last successful checkpoint rather than starting over.

**Steps and their checkpoints:**
```
1. deps-checked       — Docker, sqlite3, uuidgen verified/installed
2. files-downloaded   — Bundle files pulled from GitHub
3. env-generated      — .env written (ORG_NAME, INTERNAL_HMAC_SECRET, etc.)
4. db-created         — /var/nuble/admin.db created and seeded
5. compose-started    — docker compose up -d succeeded
6. health-verified    — all containers healthy
```

**Recovery behavior per step:**

| Failure | Recovery |
|---|---|
| Dependency install fails | Retry once, then exit with distro-specific install instructions |
| GitHub download fails | Retry 3× with exponential backoff |
| `.env` generation fails | Re-generate from scratch (idempotent) |
| `admin.db` seed fails | Drop and recreate the file |
| `docker compose up` fails | `docker compose down`, retry once; on second failure exit with logs |
| Health check fails | Wait 30s, retry 3×; on failure print container logs |

On unrecoverable failure, the script prints:
- Exactly which step failed
- The error output
- Manual recovery instructions
- A support URL

**The checkpoint file is removed on successful install.**

---

### 4. Re-run Behavior — Detect and Offer Upgrade

On re-run, `install.sh` detects an existing install by checking `/var/nuble/.nuble-version`.

```
╔══════════════════════════════════════╗
║  NubleStation is already installed   ║
║  Current version: v1.0.0             ║
║  Available version: v1.2.0           ║
╚══════════════════════════════════════╝

What would you like to do?
  [1] Upgrade to v1.2.0
  [2] Reset super admin password
  [3] Reinstall (destructive — wipes all data)
  [4] Exit
```

**Upgrade (option 1):**
- Pulls new `docker-compose.yml`, `Caddyfile`, `Corefile.template` from the new release
- Runs `docker compose pull` + `docker compose up -d` (rolling update)
- Runs any new `admin.db` schema migrations via the console boot runner
- Does **not** touch `/var/nuble/admin.db` data
- Writes new version to `/var/nuble/.nuble-version`

**Password reset (option 2):**
- Prompts for new password
- Hashes via temporary Docker container (see ADR 006 §1 + `TO-DO/install-sh-argon2-hashing.md`)
- Updates `admin_users.password_hash` for the `super_admin` row in `admin.db`
- Does not restart any services

**Reinstall (option 3):**
- Requires double confirmation: `"Type DESTROY to confirm"`
- `docker compose down -v`
- `rm -rf /var/nuble/`
- Runs full install from scratch

**No changes (option 4):** Exit cleanly.

---

### 5. Target OS — Mainstream Linux, Ubuntu-first

| Distro | Package manager | Status |
|---|---|---|
| Ubuntu 22.04+ | apt | Primary target (PFE demo) |
| Debian 12+ | apt | Supported |
| Fedora 39+ | dnf | Supported |
| Arch Linux | pacman | Best-effort |
| Alpine Linux | apk | Not supported (musl, no systemd) |
| macOS | — | Not supported (Docker Desktop required; dev only) |

The script detects the package manager at the top:
```bash
if command -v apt-get >/dev/null; then PKG=apt
elif command -v dnf >/dev/null; then PKG=dnf
elif command -v pacman >/dev/null; then PKG=pacman
else echo "Unsupported package manager." && exit 1
fi
```

---

## The Full Install Flow

```
curl -sSL https://get.nublestation.io/install.sh | bash

  [display] ASCII logo + version banner
  [check]   Already installed? → offer upgrade/reset/reinstall menu
  [check]   Running as root or with sudo?
  [detect]  Package manager (apt/dnf/pacman)
  [install] Docker + docker compose plugin (if missing)
  [install] sqlite3 CLI (if missing)
  [install] whiptail or dialog (if missing, for TUI prompts)
  [prompt]  Organization name
  [prompt]  Organization description (optional)
  [prompt]  Super admin email
  [prompt]  Super admin password (hidden input, confirm twice)
  [download] docker-compose.yml, seed-admin.sql, Caddyfile, Corefile.template
  [generate] INTERNAL_HMAC_SECRET (openssl rand -hex 32)
  [generate] ORG_DOMAIN from org name (lowercase, spaces→hyphens)
  [generate] .env file
  [generate] CoreDNS Corefile from template (inject ORG_DOMAIN + host IP)
  [create]  /var/nuble/ directory structure
  [create]  /var/nuble/admin.db (sqlite3 < seed-admin.sql)
  [hash]    password via Docker: docker run --rm node:22-alpine ...
  [insert]  org + super_admin row into admin.db
  [write]   /var/nuble/.nuble-version
  [run]     docker compose up -d
  [wait]    health checks on all containers (30s timeout per service)
  [display] Success banner:

  ╔═══════════════════════════════════════════════╗
  ║  NubleStation is ready!                       ║
  ║                                               ║
  ║  Console: http://console.{org}.local          ║
  ║  Admin:   {email}                             ║
  ║                                               ║
  ║  Point your router's DNS to this machine:     ║
  ║  IP: {detected_host_ip}                       ║
  ╚═══════════════════════════════════════════════╝
```

---

## Consequences

- `install.sh` must detect the package manager and install dependencies without assuming apt.
- The ANSI logo is maintained as a string constant in `install.sh` — any brand change requires updating it manually.
- The checkpoint file must be cleaned up on success and preserved on failure.
- Password reset is a first-class operation, not an afterthought — it must be documented in the user-facing README.
- `seed-admin.sql` is a release artifact — schema changes require a new version and migration path.
- The upgrade path must never touch app data in PostgreSQL — only platform infra files and `admin.db` schema.
