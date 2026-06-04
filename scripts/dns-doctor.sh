#!/usr/bin/env sh
# NubleStation — DNS Doctor
#
# Diagnoses and repairs the full *.{ORG_DOMAIN}.local DNS stack on this host.
# Unlike the old configure-dns.sh, it keeps ALL THREE sources of truth in sync:
#   1. HOST_IP in /var/nuble/.env
#   2. /etc/hosts          (resolution for THIS machine only)
#   3. CoreDNS Corefile    (resolution for every other LAN device — phones, tablets)
#
# The bug this was born from: configure-dns.sh updated /etc/hosts but never
# regenerated the Corefile, so CoreDNS kept handing every phone the stale IP
# baked in at install time. /etc/hosts and the Corefile silently drifted apart.
#
# IP policy: explicit. Uses the IP arg if given, else HOST_IP from .env. The
# live interface address is detected only for drift WARNINGS, never to overwrite
# your choice — so you stay in control when hopping between routers.
#
# Usage:
#   dns-doctor.sh [IP]          diagnose + auto-fix (default), using [IP] or .env HOST_IP
#   dns-doctor.sh --check [IP]  diagnose only — read-only, changes nothing
#   dns-doctor.sh --help
#
# Safe to re-run — every fix step is idempotent.
set -eu

ENV_FILE="/var/nuble/.env"
COREFILE="/var/nuble/coredns/Corefile"
COREDNS_CONTAINER="nublestation-coredns-1"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# ── Colors ────────────────────────────────────────────────────────────────────
G="$(printf '\033[0;32m')"
Y="$(printf '\033[1;33m')"
R="$(printf '\033[0;31m')"
B="$(printf '\033[1m')"
P="$(printf '\033[38;5;99m')"
DIM="$(printf '\033[2m')"
NC="$(printf '\033[0m')"

info()    { printf '  %s✓%s  %s\n' "$G"  "$NC" "$1"; }
warn()    { printf '  %s⚠%s  %s\n' "$Y"  "$NC" "$1"; ISSUES=$((ISSUES + 1)); }
error()   { printf '  %s✗%s  %s\n' "$R"  "$NC" "$1" >&2; exit 1; }
step()    { printf '  %s→%s  %s\n' "$P"  "$NC" "$1"; }
kv()      { printf '  %s%-22s%s %s\n' "$DIM" "$1" "$NC" "$2"; }
section() {
  printf '\n%s%s  %s%s\n' "$P" "$B" "$1" "$NC"
  printf '%s  ──────────────────────────────────────────────────%s\n\n' "$DIM" "$NC"
}

ISSUES=0
MODE="fix"   # fix | check

# ── Parse args ──────────────────────────────────────────────────────────────────
IP_ARG=""
for arg in "$@"; do
  case "$arg" in
    --check|-c)  MODE="check" ;;
    --fix)       MODE="fix" ;;
    -h|--help)
      printf 'NubleStation DNS Doctor\n\n'
      printf '  dns-doctor.sh [IP]          diagnose + fix (default)\n'
      printf '  dns-doctor.sh --check [IP]  diagnose only (read-only)\n'
      printf '  dns-doctor.sh --help\n\n'
      printf 'IP defaults to HOST_IP in %s. Pass an IP when on a different\n' "$ENV_FILE"
      printf 'router (e.g. the offline nublestation LAN where this host is .12).\n'
      exit 0 ;;
    -*)          error "Unknown option: $arg (try --help)" ;;
    *)           IP_ARG="$arg" ;;
  esac
done

# ── Header ──────────────────────────────────────────────────────────────────────
printf '\n  %s%sNubleStation — DNS Doctor%s' "$B" "$P" "$NC"
[ "$MODE" = "check" ] && printf '  %s(read-only)%s' "$DIM" "$NC"
printf '\n'

# ── Load env ────────────────────────────────────────────────────────────────────
[ -f "$ENV_FILE" ] || error "No env file at $ENV_FILE — run install.sh first"

ORG_DOMAIN="$(grep '^ORG_DOMAIN=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
ENV_IP="$(grep '^HOST_IP=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
[ -n "$ORG_DOMAIN" ] || error "ORG_DOMAIN not found in $ENV_FILE"

# Target IP: explicit arg wins, else .env HOST_IP.
HOST_IP="${IP_ARG:-$ENV_IP}"
[ -n "$HOST_IP" ] || error "No IP given and HOST_IP missing from $ENV_FILE — pass one: dns-doctor.sh 192.168.1.12"

CONSOLE="console.${ORG_DOMAIN}.local"
API="api.${ORG_DOMAIN}.local"

# ── Detect the live LAN IP (offline-safe, for drift warnings only) ──────────────
detect_live_ip() {
  _ip="$(ip route get 1.1.1.1 2>/dev/null \
    | awk '{for(i=1;i<=NF;i++) if($i=="src"){print $(i+1); exit}}')"
  if [ -z "$_ip" ]; then
    _dev="$(ip route show default 2>/dev/null \
      | awk '{for(i=1;i<=NF;i++) if($i=="dev"){print $(i+1); exit}}')"
    [ -n "$_dev" ] && _ip="$(ip -4 addr show "$_dev" 2>/dev/null \
      | awk '/inet /{print $2}' | cut -d/ -f1 | head -1)"
  fi
  if [ -z "$_ip" ]; then
    _ip="$(ip -4 addr show scope global 2>/dev/null \
      | awk '/inet /{print $2" "$NF}' | grep -vE 'docker|br-' \
      | awk '{print $1}' | cut -d/ -f1 | head -1)"
  fi
  printf '%s' "$_ip"
}
LIVE_IP="$(detect_live_ip)"

# Locate the Corefile template (repo layout or downloaded bundle).
find_template() {
  for p in \
    "$SCRIPT_DIR/../infra/coredns/Corefile.template" \
    "/var/nuble/install/infra/coredns/Corefile.template" \
    "$SCRIPT_DIR/../NubleStation/infra/coredns/Corefile.template"; do
    [ -f "$p" ] && { printf '%s' "$p"; return 0; }
  done
  return 1
}

# What CoreDNS currently answers for the console name (the phone's view).
corefile_ip() {
  [ -f "$COREFILE" ] || return 0
  grep -oE 'IN A [0-9.]+' "$COREFILE" 2>/dev/null | head -1 | awk '{print $3}'
}
# What /etc/hosts currently maps the console name to (this machine's view).
hosts_ip() {
  awk -v h="$CONSOLE" '$0 !~ /^#/ { for(i=2;i<=NF;i++) if($i==h){print $1; exit} }' /etc/hosts 2>/dev/null
}

# ── Summary ─────────────────────────────────────────────────────────────────────
section "Configuration"
kv "Org domain:"   "${ORG_DOMAIN}.local"
kv "Target IP:"    "$HOST_IP  ${DIM}(${IP_ARG:+from arg}${IP_ARG:-from .env})${NC}"
kv "Live LAN IP:"  "${LIVE_IP:-?}"

# ╭───────────────────────────────────────────────────────────────────────────────╮
# │ DIAGNOSE — always runs, never mutates                                          │
# ╰───────────────────────────────────────────────────────────────────────────────╯
section "Diagnosis"

# 1 — Target vs live IP drift (the original gotcha)
if [ -n "$LIVE_IP" ] && [ "$HOST_IP" != "$LIVE_IP" ]; then
  warn "Target IP $HOST_IP ≠ this machine's live IP $LIVE_IP"
  printf '       %sIf devices reach console via THIS network, pass %s%s%s instead.%s\n' \
    "$DIM" "$B" "$LIVE_IP" "$DIM" "$NC"
  printf '       %sIf you are pre-configuring for another router (e.g. .12 on the%s\n' "$DIM" "$NC"
  printf '       %snublestation LAN), this is expected — ignore.%s\n' "$DIM" "$NC"
else
  info "Target IP matches live IP"
fi

# 2 — .env HOST_IP
if [ "$ENV_IP" = "$HOST_IP" ]; then
  info ".env HOST_IP = $ENV_IP"
else
  warn ".env HOST_IP = ${ENV_IP:-unset} (target is $HOST_IP)"
fi

# 3 — /etc/hosts
_h="$(hosts_ip)"
if [ "$_h" = "$HOST_IP" ]; then
  info "/etc/hosts → $CONSOLE = $_h"
else
  warn "/etc/hosts → $CONSOLE = ${_h:-missing} (should be $HOST_IP)"
fi

# 4 — CoreDNS Corefile (what every phone/tablet receives)
_c="$(corefile_ip)"
if [ ! -f "$COREFILE" ]; then
  warn "Corefile missing at $COREFILE"
elif [ "$_c" = "$HOST_IP" ]; then
  info "Corefile answer = $_c"
else
  warn "Corefile answer = ${_c:-none} (should be $HOST_IP) — phones get the wrong IP!"
fi

# 5 — Port 53 free / systemd-resolved
if command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet systemd-resolved 2>/dev/null; then
  warn "systemd-resolved is active — it squats on port 53 (CoreDNS can't bind)"
else
  info "systemd-resolved not active — port 53 is free for CoreDNS"
fi

# 6 — nsswitch mDNS trap
if grep -q 'mdns4_minimal \[NOTFOUND=return\]' /etc/nsswitch.conf 2>/dev/null; then
  warn "nsswitch.conf has the mdns4_minimal [NOTFOUND=return] trap — *.local short-circuits"
else
  info "nsswitch.conf has no mDNS trap"
fi

# 7 — resolv.conf points at CoreDNS
if grep -q '^nameserver 127.0.0.1' /etc/resolv.conf 2>/dev/null; then
  info "/etc/resolv.conf points at 127.0.0.1 (CoreDNS)"
else
  warn "/etc/resolv.conf does not list 127.0.0.1 first — this host won't use CoreDNS"
fi

# 8 — CoreDNS container
if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "$COREDNS_CONTAINER"; then
  info "CoreDNS container is up ($COREDNS_CONTAINER)"
else
  warn "CoreDNS container not running — start the stack (install.sh / docker compose up)"
fi

# 9 — Live resolution assertion (the ground truth)
if command -v dig >/dev/null 2>&1; then
  _ans="$(dig +short @127.0.0.1 "$CONSOLE" A 2>/dev/null | grep -E '^[0-9.]+$' | head -1)"
  if [ "$_ans" = "$HOST_IP" ]; then
    info "dig @127.0.0.1 $CONSOLE → $_ans  (matches target)"
  elif [ -n "$_ans" ]; then
    warn "dig @127.0.0.1 $CONSOLE → $_ans (expected $HOST_IP)"
  else
    warn "dig @127.0.0.1 $CONSOLE returned nothing — CoreDNS not answering"
  fi
else
  printf '  %s·%s  dig not installed — skipping live query check\n' "$DIM" "$NC"
fi

# ╭───────────────────────────────────────────────────────────────────────────────╮
# │ FIX — default; skipped in --check                                              │
# ╰───────────────────────────────────────────────────────────────────────────────╯
if [ "$MODE" = "check" ]; then
  section "Result"
  if [ "$ISSUES" -eq 0 ]; then
    info "No issues found — DNS stack looks healthy"
  else
    warn "$ISSUES issue(s) found — re-run without --check to fix"
  fi
else
  section "Repair"

  # Step 1 — free port 53
  if command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet systemd-resolved 2>/dev/null; then
    step "Disabling systemd-resolved to free port 53"
    sudo systemctl disable --now systemd-resolved
    [ -L /etc/resolv.conf ] && sudo rm /etc/resolv.conf
    info "systemd-resolved disabled"
  fi

  # Step 2 — stop NetworkManager clobbering resolv.conf, then write it
  NM_CONF="/etc/NetworkManager/conf.d/nublestation-dns.conf"
  if command -v nmcli >/dev/null 2>&1 && [ ! -f "$NM_CONF" ]; then
    step "Telling NetworkManager to leave resolv.conf alone"
    sudo mkdir -p "$(dirname "$NM_CONF")"
    printf '[main]\ndns=none\n' | sudo tee "$NM_CONF" >/dev/null
    systemctl is-active --quiet NetworkManager 2>/dev/null \
      && sudo systemctl reload-or-restart NetworkManager 2>/dev/null || true
    info "NetworkManager DNS management disabled"
  fi
  step "Writing /etc/resolv.conf (127.0.0.1 + 8.8.8.8 fallback)"
  sudo chattr -i /etc/resolv.conf 2>/dev/null || true
  printf 'nameserver 127.0.0.1\nnameserver 8.8.8.8\n' | sudo tee /etc/resolv.conf >/dev/null
  sudo chattr +i /etc/resolv.conf 2>/dev/null || warn "chattr unavailable — resolv.conf may be overwritten on reboot"
  info "/etc/resolv.conf set"

  # Step 3 — nsswitch mDNS trap
  if grep -q 'mdns4_minimal \[NOTFOUND=return\]' /etc/nsswitch.conf 2>/dev/null; then
    step "Removing mdns4_minimal [NOTFOUND=return] trap"
    sudo sed -i 's/mdns4_minimal \[NOTFOUND=return\] //' /etc/nsswitch.conf
    info "nsswitch.conf fixed"
  fi

  # Step 4 — /etc/hosts (this machine)
  step "Syncing /etc/hosts → $HOST_IP"
  sudo sed -i "/${ORG_DOMAIN}\\.local/d" /etc/hosts
  printf '%s  %s %s\n' "$HOST_IP" "$CONSOLE" "$API" | sudo tee -a /etc/hosts >/dev/null
  info "/etc/hosts updated"

  # Step 5 — CoreDNS Corefile (every other device) ← the step the old script skipped
  step "Regenerating Corefile → answers $HOST_IP"
  sudo mkdir -p "$(dirname "$COREFILE")"
  if TPL="$(find_template)"; then
    sed "s/\${ORG_DOMAIN}/${ORG_DOMAIN}/g; s/\${HOST_IP}/${HOST_IP}/g" "$TPL" \
      | sudo tee "$COREFILE" >/dev/null
    info "Corefile generated from template ($TPL)"
  else
    # Fallback: inline copy, kept in sync with infra/coredns/Corefile.template
    sudo tee "$COREFILE" >/dev/null <<EOF
${ORG_DOMAIN}.local:53 {
    template IN A ${ORG_DOMAIN}.local {
        answer "{{ .Name }} 60 IN A ${HOST_IP}"
    }
    forward . 8.8.8.8 1.1.1.1
    log
    errors
}

.:53 {
    forward . 8.8.8.8 1.1.1.1
    cache 30
    log
    errors
}
EOF
    info "Corefile generated (inline — template not found)"
  fi

  # Step 6 — persist target IP to .env so the next no-arg run agrees
  if [ "$ENV_IP" != "$HOST_IP" ]; then
    step "Updating HOST_IP in $ENV_FILE → $HOST_IP"
    if grep -q '^HOST_IP=' "$ENV_FILE"; then
      sudo sed -i "s/^HOST_IP=.*/HOST_IP=${HOST_IP}/" "$ENV_FILE"
    else
      printf 'HOST_IP=%s\n' "$HOST_IP" | sudo tee -a "$ENV_FILE" >/dev/null
    fi
    info ".env HOST_IP updated"
  fi

  # Step 7 — restart CoreDNS so it reloads the Corefile (it only reads at startup)
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "$COREDNS_CONTAINER"; then
    step "Restarting CoreDNS"
    docker restart "$COREDNS_CONTAINER" >/dev/null
    info "CoreDNS restarted"
  else
    warn "CoreDNS container not running — start the stack to apply DNS changes"
  fi

  # ── Verify ──────────────────────────────────────────────────────────────────
  section "Verification"
  if command -v dig >/dev/null 2>&1; then
    # tiny wait for CoreDNS to come back
    i=0; while [ "$i" -lt 10 ]; do
      _v="$(dig +short @127.0.0.1 "$CONSOLE" A 2>/dev/null | grep -E '^[0-9.]+$' | head -1)"
      [ -n "$_v" ] && break
      i=$((i + 1)); sleep 1
    done
    if [ "$_v" = "$HOST_IP" ]; then
      info "$CONSOLE → $_v"
    elif [ -n "$_v" ]; then
      warn "$CONSOLE → $_v (expected $HOST_IP)"
    else
      warn "CoreDNS still not answering — check: docker logs $COREDNS_CONTAINER --tail 20"
    fi
  fi
  _up="$(getent hosts google.com 2>/dev/null | head -1 || true)"
  [ -n "$_up" ] && info "Upstream forwarding works (google.com resolves)" \
                || printf '  %s·%s  Upstream (google.com) not resolving — fine on the offline LAN\n' "$DIM" "$NC"
fi

# ╭───────────────────────────────────────────────────────────────────────────────╮
# │ OTHER DEVICES — this host cannot configure phones; it can only tell you how    │
# ╰───────────────────────────────────────────────────────────────────────────────╯
section "Reaching ${ORG_DOMAIN}.local from phones / tablets"

printf '  This host fixes only ITSELF. Other devices need DNS pointed here:\n\n'
printf '  %sDNS server to use:%s  %s%s%s  (this host)\n\n' "$DIM" "$NC" "$B" "$HOST_IP" "$NC"
printf '  %sWhole network (recommended):%s\n' "$B" "$NC"
printf '    Router DHCP → DNS server (option 6) = %s. Every device inherits it.\n' "$HOST_IP"
printf '    Confirm the router reserves %s for this machine (its MAC).\n\n' "$HOST_IP"
printf '  %sPer-device (quick test):%s\n' "$B" "$NC"
printf '    iOS:     Wi-Fi → (i) → Configure DNS → Manual → add %s\n' "$HOST_IP"
printf '    Android: long-press network → Modify → IP=Static → DNS1=%s\n\n' "$HOST_IP"
printf '  %sThen on the phone open%s  %shttp://%s%s\n' "$DIM" "$NC" "$B" "$CONSOLE" "$NC"
printf '\n'
