#!/usr/bin/env bash
# setup-local.sh — One-command HTTPS setup for MyNotes on Raspberry Pi
#                  WITHOUT Docker, Docker Compose, or Manus OAuth.
#
# Authentication: local username/password (register at /register after setup)
# HTTPS:          Caddy self-signed certificate — NO port forwarding needed
# Database:       SQLite by default (no external DB server needed)
#
# What it does:
#   1. Installs Node.js 20 LTS, pnpm, and Caddy (if not already present)
#   2. Detects the Pi's LAN IP and sets the nip.io domain
#   3. Configures the database (SQLite by default, MySQL optional)
#   4. Configures AgentMail for password-reset emails (optional)
#   5. Creates /etc/mynotes/env with required secrets
#   6. Builds the app (pnpm install + pnpm build)
#   7. Installs and starts two systemd services:
#        mynotes        — Node.js app on port 3000
#        caddy-mynotes  — Caddy reverse proxy (port 443, self-signed cert)
#
# Requirements:
#   - Raspberry Pi OS (Debian/Ubuntu-based)
#   - Run as root or with sudo: sudo bash setup-local.sh
#   - NO port forwarding required (self-signed cert, no Let's Encrypt)
#
# Usage:
#   cd /home/pi/mynotes/deploy
#   sudo bash setup-local.sh              # SQLite (default)
#   sudo bash setup-local.sh --db=mysql   # MySQL (advanced)

set -euo pipefail

# ── Colour helpers ────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${GREEN}  ✓${NC} $*"; }
warn()    { echo -e "${YELLOW}  ⚠${NC} $*"; }
error()   { echo -e "${RED}  ✗${NC} $*"; exit 1; }
heading() { echo -e "\n${GREEN}▶ $*${NC}"; }
ask()     { echo -e "${CYAN}  ?${NC} $*"; }

# ── Parse arguments ───────────────────────────────────────────────────────────
DB_MODE="sqlite"
for arg in "$@"; do
  case "$arg" in
    --db=mysql)   DB_MODE="mysql" ;;
    --db=sqlite)  DB_MODE="sqlite" ;;
    --help|-h)
      echo "Usage: sudo bash setup-local.sh [--db=sqlite|mysql]"
      echo ""
      echo "  --db=sqlite   Use SQLite (default, recommended for Raspberry Pi)"
      echo "  --db=mysql    Use MySQL/MariaDB (advanced, requires external DB server)"
      echo ""
      echo "Authentication: local username/password — no Manus account needed"
      echo "HTTPS:          Self-signed certificate via Caddy — no port forwarding needed"
      exit 0
      ;;
  esac
done

# ── Must run as root ──────────────────────────────────────────────────────────
if [[ $EUID -ne 0 ]]; then
  error "Please run as root: sudo bash setup-local.sh"
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
APP_USER="${SUDO_USER:-pi}"
APP_HOME=$(eval echo "~$APP_USER")

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║   MyNotes — Native Setup (no Docker, no Manus OAuth)        ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "  Auth mode     : Local username/password"
echo "  HTTPS mode    : Self-signed certificate (no port forwarding)"
echo "  Database mode : ${DB_MODE^^}"
if [[ "$DB_MODE" == "sqlite" ]]; then
  echo "  Database file : ${REPO_ROOT}/data/mynotes.db"
fi
echo ""

# ── 0. Pull latest code ───────────────────────────────────────────────────────
heading "Updating repository"
if git -C "$REPO_ROOT" rev-parse --git-dir &>/dev/null; then
  sudo -u "$APP_USER" git -C "$REPO_ROOT" fetch origin --quiet 2>/dev/null || true
  LOCAL=$(git -C "$REPO_ROOT" rev-parse HEAD)
  REMOTE=$(git -C "$REPO_ROOT" rev-parse origin/main 2>/dev/null || echo "")
  if [[ -n "$REMOTE" && "$LOCAL" != "$REMOTE" ]]; then
    sudo -u "$APP_USER" git -C "$REPO_ROOT" pull --ff-only origin main
    info "Repo updated to $(git -C "$REPO_ROOT" rev-parse --short HEAD)"
  else
    info "Repo is up to date ($(git -C "$REPO_ROOT" rev-parse --short HEAD))"
  fi
else
  warn "Not a git repo — skipping update check"
fi

# ── 1. Install Node.js 20 LTS ─────────────────────────────────────────────────
heading "Checking Node.js"
NODE_MAJOR=0
if command -v node &>/dev/null; then
  NODE_MAJOR=$(node -e 'process.stdout.write(process.version.split(".")[0].replace("v",""))')
fi
if [[ "$NODE_MAJOR" -lt 20 ]]; then
  info "Installing Node.js 20 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
  info "Node.js $(node --version) installed"
else
  info "Node.js $(node --version) already installed"
fi

# ── 2. Install pnpm ───────────────────────────────────────────────────────────
heading "Checking pnpm"
if ! command -v pnpm &>/dev/null; then
  info "Installing pnpm..."
  npm install -g pnpm@10
  info "pnpm $(pnpm --version) installed"
else
  info "pnpm $(pnpm --version) already installed"
fi

# ── 3. Install Caddy ──────────────────────────────────────────────────────────
heading "Checking Caddy"
if ! command -v caddy &>/dev/null; then
  info "Installing Caddy..."
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    | tee /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq
  apt-get install -y caddy
  info "Caddy $(caddy version) installed"
else
  info "Caddy $(caddy version) already installed"
fi

# ── 4. Detect LAN IP and set domain ──────────────────────────────────────────
heading "Detecting Pi IP address"
PI_IP=$(ip route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src") print $(i+1)}' | head -1)
if [[ -z "$PI_IP" ]]; then
  PI_IP=$(hostname -I | awk '{print $1}')
fi
if [[ -z "$PI_IP" ]]; then
  error "Could not detect Pi IP. Set it manually: export PI_IP=192.168.x.x && sudo bash setup-local.sh"
fi

DOMAIN="mynotes.${PI_IP}.nip.io"
info "Detected IP  : $PI_IP"
info "nip.io domain: $DOMAIN"
info "App URL      : https://$DOMAIN"
warn "Self-signed cert: browser will show a warning on first visit."
warn "Click 'Advanced → Proceed' to accept, or install the Caddy root CA."

# ── 5. Create /etc/mynotes/env ────────────────────────────────────────────────
heading "Configuring secrets"
mkdir -p /etc/mynotes
chmod 750 /etc/mynotes

ENV_FILE="/etc/mynotes/env"
if [[ ! -f "$ENV_FILE" ]]; then
  touch "$ENV_FILE"
  chmod 640 "$ENV_FILE"
  chown root:"$APP_USER" "$ENV_FILE"
fi

set_env() {
  local key="$1" val="$2"
  if grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${val}|" "$ENV_FILE"
  else
    echo "${key}=${val}" >> "$ENV_FILE"
  fi
}

get_env() {
  grep "^${1}=" "$ENV_FILE" 2>/dev/null | cut -d= -f2- || echo ""
}

# Always update domain
set_env "MYNOTES_DOMAIN" "$DOMAIN"

# ── Database configuration ────────────────────────────────────────────────────
if [[ "$DB_MODE" == "sqlite" ]]; then
  DATA_DIR="${REPO_ROOT}/data"
  mkdir -p "$DATA_DIR"
  chown "$APP_USER":"$APP_USER" "$DATA_DIR"
  set_env "DATABASE_DRIVER" "sqlite"
  set_env "DATABASE_URL"    "sqlite:${DATA_DIR}/mynotes.db"
  info "Database: SQLite → ${DATA_DIR}/mynotes.db"
else
  set_env "DATABASE_DRIVER" "mysql"
  DB_URL=$(get_env "DATABASE_URL")
  if [[ -z "$DB_URL" || "$DB_URL" == sqlite:* ]]; then
    echo ""
    ask "Enter MySQL DATABASE_URL (e.g. mysql://user:pass@host:3306/mynotes):"
    read -rp "  > " DB_URL
    set_env "DATABASE_URL" "$DB_URL"
  else
    info "DATABASE_URL already set"
  fi
fi

# ── JWT secret (auto-generated if not set) ────────────────────────────────────
JWT_VAL=$(get_env "JWT_SECRET")
if [[ -z "$JWT_VAL" ]]; then
  GENERATED=$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 32)
  set_env "JWT_SECRET" "$GENERATED"
  info "JWT_SECRET auto-generated"
else
  info "JWT_SECRET already set"
fi

# ── Manus OAuth (OPTIONAL — only needed if you want Manus login) ──────────────
# Local username/password auth works without these.
# Leave blank to use only local auth.
echo ""
echo "  ┌─────────────────────────────────────────────────────────────┐"
echo "  │  Manus OAuth (OPTIONAL)                                     │"
echo "  │  Leave blank to use local username/password auth only.      │"
echo "  └─────────────────────────────────────────────────────────────┘"
VITE_APP_ID=$(get_env "VITE_APP_ID")
if [[ -z "$VITE_APP_ID" ]]; then
  ask "VITE_APP_ID (press Enter to skip Manus OAuth):"
  read -rp "  > " VITE_APP_ID
  if [[ -n "$VITE_APP_ID" ]]; then
    set_env "VITE_APP_ID"          "$VITE_APP_ID"
    set_env "OAUTH_SERVER_URL"     "https://api.manus.im"
    set_env "VITE_OAUTH_PORTAL_URL" "https://manus.im"
    info "Manus OAuth configured"
  else
    # Set empty placeholders so the app starts without errors
    set_env "VITE_APP_ID"          ""
    set_env "OAUTH_SERVER_URL"     ""
    set_env "VITE_OAUTH_PORTAL_URL" ""
    info "Manus OAuth skipped — using local auth only"
  fi
else
  info "Manus OAuth already configured (VITE_APP_ID is set)"
fi

# ── AgentMail (OPTIONAL — for password-reset emails) ─────────────────────────
echo ""
echo "  ┌─────────────────────────────────────────────────────────────┐"
echo "  │  AgentMail (OPTIONAL)                                       │"
echo "  │  Used to send password-reset emails.                        │"
echo "  │  Get a free API key at https://agentmail.to                 │"
echo "  │  Leave blank to disable email — reset links will be logged  │"
echo "  │  to the console instead (journalctl -u mynotes -f).         │"
echo "  └─────────────────────────────────────────────────────────────┘"
AGENTMAIL_KEY=$(get_env "AGENTMAIL_API_KEY")
if [[ -z "$AGENTMAIL_KEY" ]]; then
  ask "AGENTMAIL_API_KEY (press Enter to skip):"
  read -rp "  > " AGENTMAIL_KEY
  if [[ -n "$AGENTMAIL_KEY" ]]; then
    set_env "AGENTMAIL_API_KEY" "$AGENTMAIL_KEY"
    ask "AGENTMAIL_INBOX_ID (optional — leave blank to auto-create):"
    read -rp "  > " AGENTMAIL_INBOX_ID
    set_env "AGENTMAIL_INBOX_ID" "${AGENTMAIL_INBOX_ID:-}"
    ask "AGENTMAIL_INBOX_USERNAME (optional, default: mynotes-noreply):"
    read -rp "  > " AGENTMAIL_INBOX_USERNAME
    set_env "AGENTMAIL_INBOX_USERNAME" "${AGENTMAIL_INBOX_USERNAME:-mynotes-noreply}"
    info "AgentMail configured"
  else
    set_env "AGENTMAIL_API_KEY"        ""
    set_env "AGENTMAIL_INBOX_ID"       ""
    set_env "AGENTMAIL_INBOX_USERNAME" "mynotes-noreply"
    info "AgentMail skipped — password-reset links will appear in server logs"
  fi
else
  info "AgentMail already configured (AGENTMAIL_API_KEY is set)"
fi

info "/etc/mynotes/env configured"

# ── 6. Build the app ──────────────────────────────────────────────────────────
heading "Building MyNotes"
cd "$REPO_ROOT"
sudo -u "$APP_USER" pnpm install --frozen-lockfile
sudo -u "$APP_USER" pnpm build
info "Build complete"

# ── 7. Install Caddy config (self-signed) ─────────────────────────────────────
heading "Installing Caddy configuration"
mkdir -p /var/log/caddy
chown caddy:caddy /var/log/caddy 2>/dev/null || true
cp "$SCRIPT_DIR/Caddyfile.local" /etc/caddy/Caddyfile.mynotes
info "Caddyfile installed at /etc/caddy/Caddyfile.mynotes (self-signed cert)"

# ── 8. Install systemd services ───────────────────────────────────────────────
heading "Installing systemd services"

sed "s|User=pi|User=${APP_USER}|g; s|/home/pi/mynotes|${REPO_ROOT}|g" \
  "$SCRIPT_DIR/mynotes.service" > /etc/systemd/system/mynotes.service

cp "$SCRIPT_DIR/caddy-mynotes.service" /etc/systemd/system/caddy-mynotes.service

systemctl daemon-reload
systemctl enable mynotes caddy-mynotes
systemctl restart mynotes
sleep 2
systemctl restart caddy-mynotes

info "mynotes.service started"
info "caddy-mynotes.service started"

# ── 9. Done ───────────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║  MyNotes is running!                                             ║"
echo "║                                                                  ║"
printf  "║  URL: https://%-51s║\n" "${DOMAIN}"
echo "║                                                                  ║"
echo "║  ⚠  First visit: browser will warn about the certificate.       ║"
echo "║     Click 'Advanced → Proceed' to continue.                     ║"
echo "║     See HTTPS_SETUP.md to install the CA and remove the warning.║"
echo "║                                                                  ║"
echo "║  Register your first account at:                                 ║"
printf  "║    https://%-55s║\n" "${DOMAIN}/register"
echo "║                                                                  ║"
if [[ "$DB_MODE" == "sqlite" ]]; then
printf  "║  Database: SQLite → %-46s║\n" "${REPO_ROOT}/data/mynotes.db"
else
echo "║  Database: MySQL (see /etc/mynotes/env for connection string)    ║"
fi
echo "║                                                                  ║"
echo "║  View app logs:   journalctl -u mynotes -f                      ║"
echo "║  View Caddy logs: journalctl -u caddy-mynotes -f                ║"
echo "║  Stop app:        sudo systemctl stop mynotes caddy-mynotes     ║"
echo "║  Update app:      cd deploy && sudo bash setup-local.sh         ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""
