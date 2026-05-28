#!/usr/bin/env sh
# Wipes the NubleStation installation so install.sh can be re-run from scratch.
# Does NOT touch the source code repository.
set -eu

INSTALL_DIR="/var/nuble"
COMPOSE_FILE="$INSTALL_DIR/install/infra/docker-compose.yml"
ENV_FILE="$INSTALL_DIR/.env"

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

# ── Safety check ─────────────────────────────────────────────────────────────
printf '\n'
printf '  %s%sNubleStation — Full Wipe%s\n' "$B" "$R" "$NC"
printf '\n'
printf '  %sThis will permanently delete:%s\n' "$Y" "$NC"
printf '  %s  • All Docker containers and volumes (database, app files)%s\n' "$DIM" "$NC"
printf '  %s  • Everything under %s%s\n' "$DIM" "$INSTALL_DIR" "$NC"
printf '\n'
printf '  %sThe source code repository is NOT affected.%s\n' "$G" "$NC"
printf '\n'
printf '  Type %sWIPE%s to confirm: ' "$B" "$NC"
read -r _confirm
[ "$_confirm" = "WIPE" ] || error "Aborted — nothing was changed"
printf '\n'

# ── Step 1: Stop containers and remove volumes ────────────────────────────────
section "Stopping NubleStation"

if [ -f "$COMPOSE_FILE" ] && [ -f "$ENV_FILE" ]; then
  step "Stopping containers and removing volumes"
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" down -v --remove-orphans 2>/dev/null \
    && info "Containers and volumes removed" \
    || warn "docker compose down failed — containers may already be stopped"
else
  warn "No compose file found at $COMPOSE_FILE — skipping docker compose down"
  # Best-effort: stop any containers whose names start with nublestation-
  if docker ps -q --filter "name=nublestation-" | grep -q .; then
    step "Force-stopping nublestation containers"
    docker ps -q --filter "name=nublestation-" | xargs docker stop 2>/dev/null || true
    docker ps -aq --filter "name=nublestation-" | xargs docker rm 2>/dev/null || true
    info "Containers removed"
  fi
fi

# ── Step 2: Remove install directory ─────────────────────────────────────────
section "Removing install directory"

if [ -d "$INSTALL_DIR" ]; then
  step "Removing $INSTALL_DIR"
  sudo rm -rf "$INSTALL_DIR"
  info "$INSTALL_DIR removed"
else
  info "$INSTALL_DIR does not exist — nothing to remove"
fi

# ── Step 3: Remove NubleStation Docker images (optional) ─────────────────────
section "Docker images"

printf '  Remove NubleStation Docker images to force a fresh pull? [y/N]: '
read -r _pull
if [ "$_pull" = "y" ] || [ "$_pull" = "Y" ]; then
  step "Removing NubleStation images"
  docker images --format '{{.Repository}}:{{.Tag}}' \
    | grep 'nublestation' \
    | xargs docker rmi 2>/dev/null \
    && info "Images removed" \
    || warn "No NubleStation images found or removal failed"
else
  info "Images kept — docker compose will reuse the cached layers"
fi

# ── Done ──────────────────────────────────────────────────────────────────────
printf '\n'
printf '  %s%s✓  Wipe complete%s\n' "$B" "$G" "$NC"
printf '\n'
printf '  Run install.sh to start fresh:\n'
printf '  %s  bash scripts/install.sh%s\n' "$DIM" "$NC"
printf '\n'
