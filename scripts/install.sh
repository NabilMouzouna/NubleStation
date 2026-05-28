#!/usr/bin/env sh
set -eu

VERSION="staging"
INSTALL_DIR="/var/nuble"
CHECKPOINT_FILE="$INSTALL_DIR/.install-checkpoint"
VERSION_FILE="$INSTALL_DIR/.nuble-version"
REPO="https://github.com/NabilMouzouna/NubleStation"
BASE_URL="${REPO}/releases/latest/download"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# ── Colors ────────────────────────────────────────────────────────────────────
G="$(printf '\033[0;32m')"
Y="$(printf '\033[1;33m')"
R="$(printf '\033[0;31m')"
B="$(printf '\033[1m')"
NC="$(printf '\033[0m')"

# ── Logo ──────────────────────────────────────────────────────────────────────
print_logo() {
  _ver="${1:-}"
  _i="$(printf '\033[38;5;99m')"
  _b="$(printf '\033[1m')"
  _g="$(printf '\033[38;5;245m')"
  _r="$(printf '\033[0m')"
  printf '\n'
  printf '  %s        .--.        %s\n' "$_i" "$_r"
  printf '  %s     .-(    ).      %s\n' "$_i" "$_r"
  printf '  %s    (___.__)__)     %s\n' "$_i" "$_r"
  printf '\n'
  printf '  %s███╗   ██╗██╗   ██╗██████╗ ██╗     ███████╗%s\n' "$_b" "$_r"
  printf '  %s████╗  ██║██║   ██║██╔══██╗██║     ██╔════╝%s\n' "$_b" "$_r"
  printf '  %s██╔██╗ ██║██║   ██║██████╔╝██║     █████╗  %s\n' "$_b" "$_r"
  printf '  %s██║╚██╗██║██║   ██║██╔══██╗██║     ██╔══╝  %s\n' "$_b" "$_r"
  printf '  %s██║ ╚████║╚██████╔╝██████╔╝███████╗███████╗%s\n' "$_b" "$_r"
  printf '  %s╚═╝  ╚═══╝ ╚═════╝ ╚═════╝ ╚══════╝╚══════╝%s\n' "$_b" "$_r"
  printf '  %s███████╗████████╗ █████╗ ████████╗██╗ ██████╗ ███╗   ██╗%s\n' "$_g" "$_r"
  printf '  %s██╔════╝╚══██╔══╝██╔══██╗╚══██╔══╝██║██╔═══██╗████╗  ██║%s\n' "$_g" "$_r"
  printf '  %s███████╗   ██║   ███████║   ██║   ██║██║   ██║██╔██╗ ██║%s\n' "$_g" "$_r"
  printf '  %s╚════██║   ██║   ██╔══██║   ██║   ██║██║   ██║██║╚██╗██║%s\n' "$_g" "$_r"
  printf '  %s███████║   ██║   ██║  ██║   ██║   ██║╚██████╔╝██║ ╚████║%s\n' "$_g" "$_r"
  printf '  %s╚══════╝   ╚═╝   ╚═╝  ╚═╝   ╚═╝   ╚═╝ ╚═════╝ ╚═╝  ╚═══╝%s\n' "$_g" "$_r"
  printf '\n'
  printf '  %sPRIVATE · LOCAL · YOURS%s\n' "$_g" "$_r"
  if [ -n "$_ver" ]; then printf '  %s%s%s\n' "$_g" "$_ver" "$_r"; fi
  printf '\n'
}

# ── Helpers ───────────────────────────────────────────────────────────────────
info()  { printf '%s[✓]%s %s\n' "$G" "$NC" "$1"; }
warn()  { printf '%s[⚠]%s %s\n' "$Y" "$NC" "$1"; }
error() { printf '%s[✗]%s %s\n' "$R" "$NC" "$1" >&2; exit 1; }
step()  { printf '%s[→]%s %s\n' "$Y" "$NC" "$1"; }

checkpoint()      { sudo mkdir -p "$INSTALL_DIR"; printf '%s' "$1" | sudo tee "$CHECKPOINT_FILE" >/dev/null; }
last_checkpoint() { if [ -f "$CHECKPOINT_FILE" ]; then cat "$CHECKPOINT_FILE"; else printf 'none'; fi; }

# ── Package manager ───────────────────────────────────────────────────────────
PKG=""
detect_pkg_manager() {
  if   command -v apt-get >/dev/null 2>&1; then PKG=apt
  elif command -v dnf     >/dev/null 2>&1; then PKG=dnf
  elif command -v pacman  >/dev/null 2>&1; then PKG=pacman
  elif command -v brew    >/dev/null 2>&1; then PKG=brew
  else error "Unsupported package manager. Supported: apt, dnf, pacman, brew."
  fi
}

install_dep() {
  case "$PKG" in
    apt)    sudo apt-get install -y "$1" >/dev/null ;;
    dnf)    sudo dnf install -y "$1" >/dev/null ;;
    pacman) sudo pacman -S --noconfirm "$1" >/dev/null ;;
    brew)   brew install "$1" >/dev/null ;;
  esac
}

# ── TUI ───────────────────────────────────────────────────────────────────────
TUI="plain"
detect_tui() {
  if   command -v whiptail >/dev/null 2>&1; then TUI=whiptail
  elif command -v dialog   >/dev/null 2>&1; then TUI=dialog
  else TUI=plain
  fi
}

prompt_input() {
  # $1=label  $2=variable_name
  case "$TUI" in
    whiptail) eval "$2"'=$(whiptail --inputbox "'"$1"'" 8 60 3>&1 1>&2 2>&3)' ;;
    dialog)   eval "$2"'=$(dialog   --inputbox "'"$1"'" 8 60 3>&1 1>&2 2>&3)' ;;
    plain)    printf '%s: ' "$1"; read -r "$2" </dev/tty ;;
  esac
}

prompt_password() {
  # $1=label  $2=variable_name
  case "$TUI" in
    whiptail) eval "$2"'=$(whiptail --passwordbox "'"$1"'" 8 60 3>&1 1>&2 2>&3)' ;;
    dialog)   eval "$2"'=$(dialog   --passwordbox "'"$1"'" 8 60 3>&1 1>&2 2>&3)' ;;
    plain)
      printf '%s: ' "$1"
      stty -echo 2>/dev/null || true
      read -r "$2" </dev/tty
      stty echo  2>/dev/null || true
      printf '\n'
      ;;
  esac
}

# ── Download bundle ───────────────────────────────────────────────────────────
download_bundle() {
  if [ "$VERSION" = "staging" ]; then
    info "Dev mode — using local repo files"
    return 0
  fi
  step "Downloading release bundle"
  sudo mkdir -p \
    "$INSTALL_DIR/install/infra/caddy" \
    "$INSTALL_DIR/install/infra/coredns"
  _dl() { curl -sSL "${BASE_URL}/$1" | sudo tee "$2" >/dev/null || error "Failed to download $1"; }
  _dl "docker-compose.yml"  "$INSTALL_DIR/install/infra/docker-compose.yml"
  _dl "Caddyfile"           "$INSTALL_DIR/install/infra/caddy/Caddyfile"
  _dl "Corefile.template"   "$INSTALL_DIR/install/infra/coredns/Corefile.template"
  info "Bundle downloaded"
}

bundle_file() {
  if [ "$VERSION" = "staging" ]; then printf '%s/%s' "$REPO_ROOT" "$1"
  else printf '%s/install/%s' "$INSTALL_DIR" "$1"
  fi
}

# ── Re-run handling ───────────────────────────────────────────────────────────
handle_existing_install() {
  _installed_ver="$(cat "$VERSION_FILE")"
  printf '\n%s╔══════════════════════════════════════╗%s\n' "$B" "$NC"
  printf '%s║  NubleStation is already installed   ║%s\n' "$B" "$NC"
  printf '%s║  Installed: %-25s║%s\n' "$B" "$_installed_ver" "$NC"
  printf '%s╚══════════════════════════════════════╝%s\n\n' "$B" "$NC"
  printf '  [1] Upgrade to %s\n' "$VERSION"
  printf '  [2] Reset super admin password\n'
  printf '  [3] Reinstall\n'
  printf '  [4] Exit\n\n'
  printf 'Choice: '; read -r _choice </dev/tty
  case "$_choice" in
    1)
      step "Upgrading to $VERSION"
      download_bundle
      docker compose --env-file "$INSTALL_DIR/.env" \
        -f "$(bundle_file infra/docker-compose.yml)" pull
      docker compose --env-file "$INSTALL_DIR/.env" \
        -f "$(bundle_file infra/docker-compose.yml)" up -d
      printf '%s' "$VERSION" | sudo tee "$VERSION_FILE" >/dev/null
      info "Upgraded to $VERSION"
      exit 0
      ;;
    2)
      prompt_password "New super admin password" _new_pass
      [ -z "$_new_pass" ] && error "Password cannot be empty"
      _new_hash="$(hash_password "$_new_pass")"
      docker compose --env-file "$INSTALL_DIR/.env" \
        -f "$(bundle_file infra/docker-compose.yml)" \
        exec -T postgres psql -U nuble -d nuble \
        -c "UPDATE platform.users SET password_hash='${_new_hash}' WHERE role='super_admin';"
      info "Password updated"
      exit 0
      ;;
    3)
      printf '\nThis will erase all admin accounts and organization settings.\n'
      printf 'Type RESET to confirm: '; read -r _confirm </dev/tty
      [ "$_confirm" = "RESET" ] || error "Reinstall cancelled"
      printf 'Also replace docker-compose.yml, .env, Caddyfile, Corefile? [y/N]: '
      read -r _replace_infra </dev/tty
      [ "$_replace_infra" = "y" ] && sudo rm -f "$INSTALL_DIR/.env"
      info "Reset — continuing with fresh install"
      ;;
    4) exit 0 ;;
    *) error "Invalid choice" ;;
  esac
}

# ── Argon2 hashing ────────────────────────────────────────────────────────────
hash_password() {
  _salt="$(openssl rand -hex 8)"
  printf '%s' "$1" | argon2 "$_salt" -id -t 3 -m 16 -p 4 -e
}

# ── Input collection ──────────────────────────────────────────────────────────
collect_inputs() {
  prompt_input "Organization name (e.g. clinic)" ORG_NAME
  [ -z "$ORG_NAME" ] && error "Organization name cannot be empty"

  ORG_DOMAIN="$(printf '%s' "$ORG_NAME" \
    | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | tr -cd 'a-z0-9-')"
  [ -z "$ORG_DOMAIN" ] && error "Could not derive a valid domain from org name"

  prompt_input "Organization description (optional)" ORG_DESCRIPTION

  prompt_input "Super admin email" ADMIN_EMAIL
  printf '%s' "$ADMIN_EMAIL" | grep -qE '^[^@]+@[^@]+\.[^@]+$' \
    || error "Invalid email format"

  while true; do
    prompt_password "Super admin password (min 8 chars)" ADMIN_PASSWORD
    [ "${#ADMIN_PASSWORD}" -ge 8 ] || { warn "Password must be at least 8 characters"; continue; }
    prompt_password "Confirm password" _confirm_pass
    [ "$ADMIN_PASSWORD" = "$_confirm_pass" ] && break
    warn "Passwords do not match — try again"
  done
}

# ── Health check ──────────────────────────────────────────────────────────────
wait_healthy() {
  _svc="$1"; _elapsed=0; _max=120
  while [ "$_elapsed" -lt "$_max" ]; do
    case $(( _elapsed % 4 )) in
      0) _frame='-' ;; 1) _frame='\\' ;; 2) _frame='|' ;; 3) _frame='/' ;;
    esac
    printf '\r%s[→]%s Waiting for %-8s %s %ds ' "$Y" "$NC" "$_svc" "$_frame" "$_elapsed"
    if [ $(( _elapsed % 5 )) -eq 0 ]; then
      _state=$(docker inspect --format='{{.State.Health.Status}}' "nublestation-${_svc}-1" 2>/dev/null)
      if [ "$_state" = "healthy" ]; then
        printf '\r%s[✓]%s %-8s ready%-30s\n' "$G" "$NC" "$_svc" " "
        return 0
      fi
    fi
    _elapsed=$(( _elapsed + 1 ))
    sleep 1
  done
  printf '\r%s[⚠]%s %-8s did not become healthy after %ds%-10s\n' "$Y" "$NC" "$_svc" "$_max" " "
  warn "check: docker compose logs $_svc"
}

# ── Main ──────────────────────────────────────────────────────────────────────
main() {
  print_logo "$VERSION"

  if [ "$(id -u)" -ne 0 ] && ! sudo -n true 2>/dev/null; then
    error "This script requires sudo. Run as root or with a sudo-capable user."
  fi

  detect_pkg_manager
  detect_tui

  [ -f "$VERSION_FILE" ] && handle_existing_install

  # ── 1. Dependencies ─────────────────────────────────────────────────────────
  checkpoint "checking-deps"

  command -v docker >/dev/null 2>&1 || {
    step "Installing Docker"
    curl -fsSL https://get.docker.com | sh
  }
  docker compose version >/dev/null 2>&1 || error "Docker Compose v2 is required"
  info "Docker ready"

  command -v argon2 >/dev/null 2>&1 || { step "Installing argon2"; install_dep argon2; }
  info "argon2 ready"

  if ! command -v whiptail >/dev/null 2>&1 && ! command -v dialog >/dev/null 2>&1; then
    step "Installing whiptail"
    case "$PKG" in
      apt)    install_dep whiptail ;;
      dnf)    install_dep newt ;;
      pacman) install_dep libnewt ;;
      brew)   install_dep dialog ;;
    esac
    detect_tui
  fi

  checkpoint "deps-checked"

  # ── 2. Download bundle ───────────────────────────────────────────────────────
  download_bundle
  checkpoint "files-downloaded"

  # ── 3. Collect inputs ────────────────────────────────────────────────────────
  collect_inputs

  # ── 4. Detect host IP ────────────────────────────────────────────────────────
  IS_WSL=0
  grep -qi microsoft /proc/version 2>/dev/null && IS_WSL=1

  if [ -n "${HOST_IP:-}" ]; then
    info "Using HOST_IP from environment: $HOST_IP"
  elif [ "$IS_WSL" = "1" ]; then
    warn "WSL2 detected"
    HOST_IP=$(powershell.exe -NoProfile -Command \
      "(Get-NetIPConfiguration | Where-Object { \$_.IPv4DefaultGateway -and \$_.NetAdapter.Status -eq 'Up' } | Select-Object -First 1).IPv4Address.IPAddress" \
      2>/dev/null | tr -d '\r\n ')
    [ -z "$HOST_IP" ] && prompt_input "Enter host LAN IP manually" HOST_IP
  else
    HOST_IP=$(ip route get 1.1.1.1 2>/dev/null \
      | awk '{for(i=1;i<=NF;i++) if($i=="src"){print $(i+1); exit}}')
    [ -z "$HOST_IP" ] && HOST_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
  fi
  [ -z "$HOST_IP" ] && error "Could not detect host IP. Set HOST_IP env var and re-run."
  info "Host IP: $HOST_IP"

  # ── 5. Generate .env ─────────────────────────────────────────────────────────
  mkdir -p "$INSTALL_DIR"
  # Reuse existing secrets so re-runs don't break an already-initialized Postgres volume.
  if [ -f "$INSTALL_DIR/.env" ]; then
    _old_pg=$(grep '^POSTGRES_PASSWORD=' "$INSTALL_DIR/.env" | cut -d= -f2-)
    _old_hmac=$(grep '^INTERNAL_HMAC_SECRET=' "$INSTALL_DIR/.env" | cut -d= -f2-)
  fi
  POSTGRES_PASSWORD="${_old_pg:-$(openssl rand -hex 16)}"
  HMAC_SECRET="${_old_hmac:-$(openssl rand -hex 32)}"

  step "Hashing admin password"
  ADMIN_PASSWORD_HASH="$(hash_password "$ADMIN_PASSWORD")"
  [ -z "$ADMIN_PASSWORD_HASH" ] && error "Password hashing failed"

  sudo tee "$INSTALL_DIR/.env" >/dev/null <<EOF
ORG_NAME=${ORG_NAME}
ORG_DOMAIN=${ORG_DOMAIN}
HOST_IP=${HOST_IP}
INTERNAL_HMAC_SECRET=${HMAC_SECRET}
POSTGRES_USER=nuble
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
POSTGRES_DB=nuble
DATABASE_URL=postgres://nuble:${POSTGRES_PASSWORD}@postgres:5432/nuble
ADMIN_EMAIL=${ADMIN_EMAIL}
ADMIN_PASSWORD_HASH='${ADMIN_PASSWORD_HASH}'
IMAGE_TAG=${IMAGE_TAG:-staging}
EOF
  info ".env written"
  checkpoint "env-generated"

  # ── 6. Generate CoreDNS Corefile ─────────────────────────────────────────────
  sudo mkdir -p "$INSTALL_DIR/coredns"
  sed "s/\${ORG_DOMAIN}/${ORG_DOMAIN}/g; s/\${HOST_IP}/${HOST_IP}/g" \
    "$(bundle_file infra/coredns/Corefile.template)" | sudo tee "$INSTALL_DIR/coredns/Corefile" >/dev/null
  info "CoreDNS Corefile generated"

  # ── 7. /etc/hosts entries ─────────────────────────────────────────────────────
  HOSTS_LINE="$HOST_IP console.${ORG_DOMAIN}.local api.${ORG_DOMAIN}.local"
  if ! grep -q "${ORG_DOMAIN}.local" /etc/hosts 2>/dev/null; then
    printf '%s\n' "$HOSTS_LINE" | sudo tee -a /etc/hosts >/dev/null
    info "/etc/hosts updated"
  else
    warn "/etc/hosts already has ${ORG_DOMAIN}.local — skipping"
  fi

  # ── 8. Start services ─────────────────────────────────────────────────────────
  step "Pulling latest images"
  docker compose --env-file "$INSTALL_DIR/.env" \
    -f "$(bundle_file infra/docker-compose.yml)" pull

  step "Starting NubleStation stack"
  docker compose --env-file "$INSTALL_DIR/.env" \
    -f "$(bundle_file infra/docker-compose.yml)" up -d
  checkpoint "compose-started"

  # ── 9. Health checks ────────────────────────────────────────────────────────
  sleep 5
  wait_healthy "console"
  wait_healthy "api"
  checkpoint "health-verified"

  # ── 10. Finish ───────────────────────────────────────────────────────────────
  printf '%s' "$VERSION" | sudo tee "$VERSION_FILE" >/dev/null
  sudo rm -f "$CHECKPOINT_FILE"

  printf '\n%s╔══════════════════════════════════════════╗%s\n' "$G" "$NC"
  printf '%s║       NubleStation is ready!             ║%s\n' "$G" "$NC"
  printf '%s╚══════════════════════════════════════════╝%s\n' "$G" "$NC"
  printf '\n'
  printf '  Console  →  http://console.%s.local\n' "$ORG_DOMAIN"
  printf '  API      →  http://api.%s.local\n' "$ORG_DOMAIN"
  printf '  Admin    →  %s\n' "$ADMIN_EMAIL"
  printf '\n'
  printf '%s  Router DNS → point to %s%s\n' "$Y" "$HOST_IP" "$NC"
  printf '  Or add to each device hosts file:\n'
  printf '    %s\n' "$HOSTS_LINE"
  printf '\n'
  printf '%s  Developer quick-start (run on any LAN machine):%s\n' "$B" "$NC"
  printf '    nuble init --url http://api.%s.local --slug <app-slug> --key <api-key>\n' "$ORG_DOMAIN"
  printf '    nuble deploy\n\n'
}

main "$@"
