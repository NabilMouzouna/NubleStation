#!/usr/bin/env bash
set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info() { echo -e "${GREEN}▶${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC} $1"; }
error() { echo -e "${RED}✗${NC} $1"; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
INFRA_DIR="$REPO_ROOT/infra"

info "Checking Docker..."
command -v docker >/dev/null 2>&1 || error "Docker is not installed. Install from https://docs.docker.com/engine/install/"
docker compose version >/dev/null 2>&1 || error "Docker Compose v2 is required."

info "Detecting host IP..."

IS_WSL=0
if grep -qi microsoft /proc/version 2>/dev/null; then
    IS_WSL=1
fi

HOST_IFACE=""
HOST_MAC=""

if [ -n "${HOST_IP:-}" ]; then
    info "Using HOST_IP from environment: $HOST_IP"
elif [ "$IS_WSL" = "1" ]; then
    warn "WSL2 detected — fetching Windows host LAN IP"
    HOST_IP=$(powershell.exe -NoProfile -Command "(Get-NetIPConfiguration | Where-Object { \$_.IPv4DefaultGateway -and \$_.NetAdapter.Status -eq 'Up' } | Select-Object -First 1).IPv4Address.IPAddress" 2>/dev/null | tr -d '\r\n[:space:]')
    if [ -z "$HOST_IP" ]; then
        read -p "Could not auto-detect Windows host LAN IP. Enter it manually: " HOST_IP
    fi
    warn "WSL2 limitation: port 53/UDP from CoreDNS may not be reachable from other LAN devices."
else
    ROUTE_INFO=$(ip route get 1.1.1.1 2>/dev/null || true)
    if [ -n "$ROUTE_INFO" ]; then
        HOST_IFACE=$(echo "$ROUTE_INFO" | awk '{for(i=1;i<=NF;i++) if($i=="dev"){print $(i+1); exit}}')
        HOST_IP=$(echo "$ROUTE_INFO" | awk '{for(i=1;i<=NF;i++) if($i=="src"){print $(i+1); exit}}')
    fi
    [ -z "$HOST_IP" ] && HOST_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "")
    if [ -n "$HOST_IFACE" ] && [ -r "/sys/class/net/$HOST_IFACE/address" ]; then
        HOST_MAC=$(cat "/sys/class/net/$HOST_IFACE/address")
    fi
fi

[ -z "$HOST_IP" ] && error "Could not detect host IP. Set it manually via HOST_IP env var."
info "Host IP: $HOST_IP${HOST_IFACE:+ (interface: $HOST_IFACE)}${HOST_MAC:+, MAC: $HOST_MAC}"

read -p "Organization name (default: nuble): " ORG_NAME
ORG_NAME=${ORG_NAME:-nuble}

read -s -p "Admin password: " ADMIN_PASSWORD
echo
[ -z "$ADMIN_PASSWORD" ] && error "Password cannot be empty"

POSTGRES_PASSWORD=$(openssl rand -hex 16)

info "Writing .env..."
cat > "$INFRA_DIR/.env" <<EOF
ORG_NAME=$ORG_NAME
HOST_IP=$HOST_IP
ADMIN_PASSWORD=$ADMIN_PASSWORD

POSTGRES_USER=nuble
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
POSTGRES_DB=nuble

NUBLE_API_IMAGE=nginx:alpine
NUBLE_CONSOLE_IMAGE=nginx:alpine
EOF

info "Generating CoreDNS config..."
export ORG_NAME HOST_IP
envsubst < "$INFRA_DIR/coredns/Corefile.template" | tr -d '\r' > "$INFRA_DIR/coredns/Corefile"

if grep -qE '\$\{?[A-Za-z_][A-Za-z0-9_]*\}?' "$INFRA_DIR/coredns/Corefile"; then
    error "Corefile has unsubstituted variables — check Corefile.template syntax (use \${VAR}, not {\$VAR})"
fi
grep -q "^${ORG_NAME}\.local:53" "$INFRA_DIR/coredns/Corefile" || error "Corefile missing expected zone ${ORG_NAME}.local:53"
grep -q "$HOST_IP" "$INFRA_DIR/coredns/Corefile" || error "Corefile missing expected host IP $HOST_IP"

info "Adding /etc/hosts entries (requires sudo)..."
HOSTS_LINE="$HOST_IP console.$ORG_NAME.local api.$ORG_NAME.local"
if ! grep -q "$ORG_NAME.local" /etc/hosts 2>/dev/null; then
    echo "$HOSTS_LINE" | sudo tee -a /etc/hosts > /dev/null
    info "Added: $HOSTS_LINE"
else
    warn "/etc/hosts already has $ORG_NAME.local — skipping"
fi

info "Starting NubleStation stack..."
cd "$INFRA_DIR"
docker compose up -d

info "Waiting for services to be healthy..."
sleep 5

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
echo "─────────────────────────────────────────────────────────────"
echo -e "${YELLOW}⚠ Router configuration required for LAN devices${NC}"
echo "─────────────────────────────────────────────────────────────"
echo
echo "  All devices on the LAN must use this host as their DNS server."
echo "  Configure both items below in your router's admin UI:"
echo
echo "  1. DHCP RESERVATION  (so this host's IP never changes)"
echo "     IP address:  $HOST_IP"
if [ -n "$HOST_MAC" ]; then
    echo "     MAC address: $HOST_MAC"
    [ -n "$HOST_IFACE" ] && echo "     Interface:   $HOST_IFACE"
else
    echo "     MAC address: (run \`ip link show\` on the host to find the MAC of the LAN interface)"
fi
echo
echo "  2. DHCP DNS OPTION (so LAN devices resolve *.$ORG_NAME.local)"
echo "     Primary DNS: $HOST_IP"
echo "     (Look for: 'DHCP DNS', 'DNS server', or 'Option 6' in router settings)"
echo
echo "  Per-device fallback (no router access): add this line to each"
echo "  device's hosts file:"
echo "     $HOSTS_LINE"
echo "─────────────────────────────────────────────────────────────"