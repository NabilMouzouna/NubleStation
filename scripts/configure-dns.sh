#!/usr/bin/env sh
# Configures the Ubuntu DNS stack so *.{ORG_DOMAIN}.local resolves on this machine.
# Reads ORG_DOMAIN and HOST_IP from /var/nuble/.env.
# Safe to re-run — every step is idempotent.
set -eu

ENV_FILE="/var/nuble/.env"

# ── Colors ────────────────────────────────────────────────────────────────────
G="$(printf '\033[0;32m')"
Y="$(printf '\033[1;33m')"
R="$(printf '\033[0;31m')"
B="$(printf '\033[1m')"
P="$(printf '\033[38;5;99m')"
DIM="$(printf '\033[2m')"
NC="$(printf '\033[0m')"

info()    { printf '  %s✓%s  %s\n' "$G"  "$NC" "$1"; }
warn()    { printf '  %s⚠%s  %s\n' "$Y"  "$NC" "$1"; }
error()   { printf '  %s✗%s  %s\n' "$R"  "$NC" "$1" >&2; exit 1; }
step()    { printf '  %s→%s  %s\n' "$P"  "$NC" "$1"; }
section() {
  printf '\n%s%s  %s%s\n' "$P" "$B" "$1" "$NC"
  printf '%s  ──────────────────────────────────────────────────%s\n\n' "$DIM" "$NC"
}

# ── Load env ──────────────────────────────────────────────────────────────────
printf '\n'
printf '  %s%sNubleStation — DNS Configuration%s\n' "$B" "$P" "$NC"
printf '\n'

[ -f "$ENV_FILE" ] || error "No env file at $ENV_FILE — run install.sh first"

# Extract ORG_DOMAIN and HOST_IP from .env (handles quoted and unquoted values)
ORG_DOMAIN="$(grep '^ORG_DOMAIN=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
HOST_IP="$(grep '^HOST_IP=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")"

[ -n "$ORG_DOMAIN" ] || error "ORG_DOMAIN not found in $ENV_FILE"

# Allow overriding HOST_IP via first argument
if [ -n "${1:-}" ]; then
  HOST_IP="$1"
  info "Using provided IP: $HOST_IP"
fi

[ -n "$HOST_IP" ] || error "HOST_IP not found in $ENV_FILE and no IP arg provided"

printf '  %sOrg domain:%s  %s\n' "$DIM" "$NC" "$ORG_DOMAIN"
printf '  %sHost IP:%s     %s\n' "$DIM" "$NC" "$HOST_IP"
printf '\n'

# ── Step 1 — Free port 53 (disable systemd-resolved if active) ───────────────
section "Step 1 — Port 53"

if command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet systemd-resolved 2>/dev/null; then
  step "systemd-resolved is active — disabling"
  sudo systemctl disable --now systemd-resolved
  # Remove the stub symlink so CoreDNS can own /etc/resolv.conf content
  [ -L /etc/resolv.conf ] && sudo rm /etc/resolv.conf
  info "systemd-resolved disabled"
else
  info "systemd-resolved not active — port 53 is free"
fi

# ── Step 2 — Lock resolv.conf against NetworkManager overwrites ───────────────
section "Step 2 — resolv.conf"

NM_CONF_DIR="/etc/NetworkManager/conf.d"
NM_CONF="$NM_CONF_DIR/nublestation-dns.conf"

if command -v nmcli >/dev/null 2>&1; then
  if [ ! -f "$NM_CONF" ]; then
    step "Creating $NM_CONF to prevent NetworkManager from overwriting resolv.conf"
    sudo mkdir -p "$NM_CONF_DIR"
    printf '[main]\ndns=none\n' | sudo tee "$NM_CONF" >/dev/null
    info "NetworkManager DNS management disabled"

    # Reload NetworkManager config (non-disruptive)
    if systemctl is-active --quiet NetworkManager 2>/dev/null; then
      sudo systemctl reload-or-restart NetworkManager 2>/dev/null || true
    fi
  else
    info "$NM_CONF already exists — skipping"
  fi
else
  info "NetworkManager not found — skipping"
fi

step "Writing /etc/resolv.conf"
sudo chattr -i /etc/resolv.conf 2>/dev/null || true
printf 'nameserver 127.0.0.1\nnameserver 8.8.8.8\n' | sudo tee /etc/resolv.conf >/dev/null
sudo chattr +i /etc/resolv.conf 2>/dev/null || warn "chattr not available — resolv.conf may be overwritten on reboot"
info "/etc/resolv.conf set to 127.0.0.1 (CoreDNS) with 8.8.8.8 fallback"

# ── Step 3 — Fix nsswitch.conf ─────────────────────────────────────────────
section "Step 3 — nsswitch.conf"

if grep -q 'mdns4_minimal \[NOTFOUND=return\]' /etc/nsswitch.conf 2>/dev/null; then
  step "Removing mdns4_minimal [NOTFOUND=return] trap"
  sudo sed -i 's/mdns4_minimal \[NOTFOUND=return\] //' /etc/nsswitch.conf
  info "nsswitch.conf updated"
else
  info "nsswitch.conf already correct — no mDNS trap found"
fi

# Confirm result
_nsswitch="$(grep '^hosts:' /etc/nsswitch.conf | head -1)"
printf '  %shosts line:%s  %s\n' "$DIM" "$NC" "$_nsswitch"

# ── Step 4 — /etc/hosts ───────────────────────────────────────────────────────
section "Step 4 — /etc/hosts"

step "Removing stale ${ORG_DOMAIN}.local entries"
# Temporarily unlock resolv.conf if immutable; /etc/hosts is a different file
sudo sed -i "/${ORG_DOMAIN}\\.local/d" /etc/hosts
printf '%s  console.%s.local\n%s  api.%s.local\n' \
  "$HOST_IP" "$ORG_DOMAIN" "$HOST_IP" "$ORG_DOMAIN" \
  | sudo tee -a /etc/hosts >/dev/null
info "/etc/hosts updated — console and api entries pointing to $HOST_IP"

# ── Step 5 — Restart CoreDNS ──────────────────────────────────────────────────
section "Step 5 — CoreDNS"

if docker ps --format '{{.Names}}' 2>/dev/null | grep -q 'nublestation-coredns'; then
  step "Restarting CoreDNS so it picks up current config"
  docker restart nublestation-coredns-1
  info "CoreDNS restarted"
else
  warn "CoreDNS container not running — start the stack with install.sh first"
fi

# ── Verify ────────────────────────────────────────────────────────────────────
section "Verification"

step "Testing console.${ORG_DOMAIN}.local..."
_result="$(getent hosts "console.${ORG_DOMAIN}.local" 2>/dev/null || true)"
if [ -n "$_result" ]; then
  info "console.${ORG_DOMAIN}.local → ${_result}"
else
  warn "getent returned nothing — CoreDNS may still be starting, or a layer above needs attention"
  printf '\n'
  printf '  %sDiagnostic steps:%s\n' "$Y" "$NC"
  printf '  %s  1. Check CoreDNS:   docker logs nublestation-coredns-1 --tail 20%s\n' "$DIM" "$NC"
  printf '  %s  2. Check port 53:   sudo ss -ulpn | grep \":53\"%s\n' "$DIM" "$NC"
  printf '  %s  3. Check nsswitch:  grep hosts /etc/nsswitch.conf%s\n' "$DIM" "$NC"
  printf '  %s  4. Direct query:    dig @127.0.0.1 console.%s.local%s\n' "$DIM" "$ORG_DOMAIN" "$NC"
fi

step "Testing upstream forwarding (google.com)..."
_upstream="$(getent hosts google.com 2>/dev/null | head -1 || true)"
if [ -n "$_upstream" ]; then
  info "Internet forwarding works — google.com resolves"
else
  warn "Internet forwarding failed — check CoreDNS upstream config"
fi

printf '\n'
printf '  %s%s✓  DNS configuration complete%s\n' "$B" "$G" "$NC"
printf '\n'
printf '  Open %shttp://console.%s.local%s in a browser to verify.\n' "$B" "$ORG_DOMAIN" "$NC"
printf '\n'
