#!/usr/bin/env bash
set -euo pipefail

# --- Colors for output ---
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info() { echo -e "${GREEN}▶${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC} $1"; }
error() { echo -e "${RED}✗${NC} $1"; exit 1; }

# --- Resolve repo root ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
INFRA_DIR="$REPO_ROOT/infra"

# --- Check Docker ---
info "Checking Docker..."
command -v docker >/dev/null 2>&1 || error "Docker is not installed. Install from https://docs.docker.com/engine/install/"
docker compose version >/dev/null 2>&1 || error "Docker Compose v2 is required."

# --- Detect host IP ---
info "Detecting host IP..."

IS_WSL=0
if grep -qi microsoft /proc/version 2>/dev/null; then
    IS_WSL=1
fi

if [ -n "${HOST_IP:-}" ]; then
    info "Using HOST_IP from environment: $HOST_IP"
elif [ "$IS_WSL" = "1" ]; then
    warn "WSL2 detected — fetching Windows host LAN IP (WSL's own IP is NAT'd and not reachable from LAN)"
    HOST_IP=$(powershell.exe -NoProfile -Command "(Get-NetIPConfiguration | Where-Object { \$_.IPv4DefaultGateway -and \$_.NetAdapter.Status -eq 'Up' } | Select-Object -First 1).IPv4Address.IPAddress" 2>/dev/null | tr -d '\r\n[:space:]')
    if [ -z "$HOST_IP" ]; then
        read -p "Could not auto-detect Windows host LAN IP. Enter it manually: " HOST_IP
    fi
    warn "WSL2 limitation: port 53/UDP from CoreDNS may not be reachable from other LAN devices."
    warn "HTTP on 80/443 works fine. For the real LAN demo, run on a native Linux host."
else
    HOST_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || ipconfig getifaddr en0 2>/dev/null || echo "")
fi

[ -z "$HOST_IP" ] && error "Could not detect host IP. Set it manually via HOST_IP env var."
info "Host IP: $HOST_IP"

# --- Prompt for org name ---
read -p "Organization name (default: nuble): " ORG_NAME
ORG_NAME=${ORG_NAME:-nuble}

# --- Prompt for admin password ---
read -s -p "Admin password: " ADMIN_PASSWORD
echo
[ -z "$ADMIN_PASSWORD" ] && error "Password cannot be empty"

# --- Generate Postgres password ---
POSTGRES_PASSWORD=$(openssl rand -hex 16)

# --- Write .env ---
info "Writing .env..."
cat > "$REPO_ROOT/.env" <<EOF
ORG_NAME=$ORG_NAME
HOST_IP=$HOST_IP
ADMIN_PASSWORD=$ADMIN_PASSWORD

POSTGRES_USER=nuble
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
POSTGRES_DB=nuble

NUBLE_API_IMAGE=nginx:alpine
NUBLE_CONSOLE_IMAGE=nginx:alpine
NUBLE_MDNS_IMAGE=nublestation/mdns-announcer:latest
EOF

# --- Generate Corefile from template ---
info "Generating CoreDNS config..."
export ORG_NAME HOST_IP
envsubst < "$INFRA_DIR/coredns/Corefile.template" > "$INFRA_DIR/coredns/Corefile"

# --- /etc/hosts entries (host machine only) ---
info "Adding /etc/hosts entries (requires sudo)..."
HOSTS_LINE="$HOST_IP console.$ORG_NAME.local api.$ORG_NAME.local"
if ! grep -q "$ORG_NAME.local" /etc/hosts 2>/dev/null; then
    echo "$HOSTS_LINE" | sudo tee -a /etc/hosts > /dev/null
    info "Added: $HOSTS_LINE"
else
    warn "/etc/hosts already has $ORG_NAME.local — skipping"
fi

# --- Start the stack ---
info "Starting NubleStation stack..."
cd "$INFRA_DIR"
docker compose --env-file "$REPO_ROOT/.env" up -d

# --- Wait for health ---
info "Waiting for services to be healthy..."
sleep 5

# --- Done ---
echo
echo -e "${GREEN}✓ NubleStation is running${NC}"
echo
echo "  Console:  http://console.$ORG_NAME.local"
echo "  API:      http://api.$ORG_NAME.local"
echo
echo "  Status:   docker compose -f $INFRA_DIR/docker-compose.yml ps"
echo "  Logs:     docker compose -f $INFRA_DIR/docker-compose.yml logs -f"
echo "  Stop:     docker compose -f $INFRA_DIR/docker-compose.yml down"
echo
warn "From other LAN devices, you'll need to either:"
warn "  1. Configure your router DNS to point at $HOST_IP, OR"
warn "  2. Add this line to each device's hosts file:"
warn "     $HOSTS_LINE"