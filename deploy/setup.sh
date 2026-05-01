#!/usr/bin/env bash
# setup.sh — One-command HTTPS setup for MyNotes on Raspberry Pi
#
# Usage:
#   cd /path/to/mynotes/deploy
#   chmod +x setup.sh
#   ./setup.sh
#
# What it does:
#   1. Detects your Pi's LAN IP address
#   2. Creates a .env file with the nip.io domain pre-filled
#   3. Prompts for required secrets (DATABASE_URL, JWT_SECRET, etc.)
#   4. Starts the app + Caddy reverse proxy via Docker Compose
#   5. Caddy automatically obtains a Let's Encrypt certificate
#
# Requirements:
#   - Docker and Docker Compose installed (sudo apt install docker.io docker-compose-plugin)
#   - Ports 80 and 443 forwarded to this Pi on your router
#   - Internet access (for Let's Encrypt ACME challenge)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║   MyNotes — HTTPS Setup (nip.io + Caddy)    ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# ── 1. Detect LAN IP ──────────────────────────────────────────────────────────
PI_IP=$(ip route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src") print $(i+1)}' | head -1)
if [[ -z "$PI_IP" ]]; then
  PI_IP=$(hostname -I | awk '{print $1}')
fi

if [[ -z "$PI_IP" ]]; then
  echo "ERROR: Could not detect your Pi's IP address."
  echo "Please set it manually: export PI_IP=192.168.x.x"
  exit 1
fi

DOMAIN="mynotes.${PI_IP}.nip.io"
echo "Detected Pi IP : $PI_IP"
echo "nip.io domain  : $DOMAIN"
echo "App URL        : https://$DOMAIN"
echo ""

# ── 2. Create .env if it doesn't exist ───────────────────────────────────────
if [[ ! -f .env ]]; then
  echo "Creating .env from template..."
  cp env-example.txt .env
  # Pre-fill the domain
  sed -i "s|MYNOTES_DOMAIN=.*|MYNOTES_DOMAIN=${DOMAIN}|" .env
  echo "  ✓ MYNOTES_DOMAIN set to ${DOMAIN}"
else
  echo ".env already exists — skipping creation."
  # Update domain in existing .env
  sed -i "s|MYNOTES_DOMAIN=.*|MYNOTES_DOMAIN=${DOMAIN}|" .env
  echo "  ✓ MYNOTES_DOMAIN updated to ${DOMAIN}"
fi

# ── 3. Prompt for required secrets if not already set ────────────────────────
prompt_if_empty() {
  local key="$1"
  local prompt="$2"
  local current
  current=$(grep "^${key}=" .env | cut -d= -f2-)
  if [[ -z "$current" || "$current" == "change-me-to-a-random-secret" ]]; then
    read -rp "  Enter ${prompt}: " value
    sed -i "s|^${key}=.*|${key}=${value}|" .env
  fi
}

echo ""
echo "Checking required secrets..."
prompt_if_empty "DATABASE_URL" "DATABASE_URL (e.g. mysql://user:pass@host:3306/db)"
prompt_if_empty "JWT_SECRET"   "JWT_SECRET (or press Enter to auto-generate)"

# Auto-generate JWT_SECRET if still empty
JWT_VAL=$(grep "^JWT_SECRET=" .env | cut -d= -f2-)
if [[ -z "$JWT_VAL" || "$JWT_VAL" == "change-me-to-a-random-secret" ]]; then
  GENERATED=$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 32)
  sed -i "s|^JWT_SECRET=.*|JWT_SECRET=${GENERATED}|" .env
  echo "  ✓ JWT_SECRET auto-generated"
fi

# ── 4. Check Docker is available ─────────────────────────────────────────────
echo ""
if ! command -v docker &>/dev/null; then
  echo "ERROR: Docker is not installed."
  echo "Install it with: sudo apt update && sudo apt install -y docker.io docker-compose-plugin"
  exit 1
fi

if ! docker compose version &>/dev/null 2>&1; then
  echo "ERROR: Docker Compose plugin is not installed."
  echo "Install it with: sudo apt update && sudo apt install -y docker-compose-plugin"
  exit 1
fi

# ── 5. Build and start ────────────────────────────────────────────────────────
echo "Building and starting MyNotes..."
echo "(This may take a few minutes on first run)"
echo ""
docker compose up -d --build

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  MyNotes is starting!                                        ║"
echo "║                                                              ║"
echo "║  URL: https://${DOMAIN}"
echo "║                                                              ║"
echo "║  Caddy is obtaining a Let's Encrypt certificate.            ║"
echo "║  This takes ~30 seconds on first run.                       ║"
echo "║                                                              ║"
echo "║  View logs: docker compose logs -f                          ║"
echo "║  Stop:      docker compose down                             ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
