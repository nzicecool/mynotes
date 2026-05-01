# MyNotes — HTTPS Setup for Raspberry Pi

This guide explains how to run MyNotes over HTTPS on a Raspberry Pi using
**Caddy** as a reverse proxy and **nip.io** as a free wildcard DNS service.
Three options are provided — choose the one that best fits your setup.

---

## Why HTTPS?

The Web Crypto API (`crypto.subtle`) — which MyNotes uses for note encryption
— is only available in **secure contexts** (HTTPS or `localhost`). Accessing
the app over plain HTTP on a local IP address (e.g. `http://192.168.1.50:3000`)
causes the browser to block all encryption operations.

---

## How nip.io Works

[nip.io](https://nip.io) is a free, public wildcard DNS service. Any domain of
the form `<label>.<IP>.nip.io` resolves to `<IP>`. For example:

| Domain | Resolves to |
|---|---|
| `mynotes.192.168.1.50.nip.io` | `192.168.1.50` |
| `app.10.0.0.5.nip.io` | `10.0.0.5` |

This gives your Pi a real, publicly resolvable domain name — which is required
for Let's Encrypt to issue a trusted TLS certificate.

---

## Choosing an Option

| | Option A — Native | Option B — Docker | Option C — Docker self-signed |
|---|---|---|---|
| **Docker required** | No | Yes | Yes |
| **Certificate type** | Let's Encrypt (trusted) | Let's Encrypt (trusted) | Self-signed (browser warning) |
| **Port forwarding required** | Yes (80 + 443) | Yes (80 + 443) | No |
| **Auto-starts on reboot** | Yes (systemd) | Yes (docker compose) | Yes (docker compose) |
| **Best for** | Keeping a clean native install | Isolated container setup | No port forwarding available |

---

## Option A — Native Install (no Docker, recommended)

This is the simplest approach if you already have Node.js on the Pi and prefer
not to use Docker. Caddy and the Node.js app both run as systemd services and
start automatically on reboot.

### Prerequisites

Ports **80** and **443** must be reachable from the internet so Let's Encrypt
can complete its HTTP-01 ACME challenge. Log in to your router and add:

| External port | Internal IP | Internal port | Protocol |
|---|---|---|---|
| 80 | `<Pi LAN IP>` | 80 | TCP |
| 443 | `<Pi LAN IP>` | 443 | TCP |

### One-command setup

```bash
# Clone the repo (if you haven't already)
git clone https://github.com/nzicecool/mynotes.git
cd mynotes/deploy

# Run the setup script as root
sudo bash setup-local.sh
```

The script will automatically:
1. Pull the latest code from GitHub
2. Install Node.js 20 LTS, pnpm, and Caddy (if not already present)
3. Detect your Pi's LAN IP and set `MYNOTES_DOMAIN=mynotes.<IP>.nip.io`
4. Create `/etc/mynotes/env` with required secrets (prompts for missing values)
5. Run `pnpm install && pnpm build`
6. Install and start two systemd services: `mynotes` and `caddy-mynotes`
7. Caddy obtains a Let's Encrypt certificate automatically (~30 seconds)

Open `https://mynotes.<YOUR_PI_IP>.nip.io` in your browser.

### Updating to a new version

```bash
cd mynotes/deploy
sudo bash setup-local.sh
```

The script pulls the latest code, rebuilds, and restarts both services.

### Useful commands

```bash
# View app logs
journalctl -u mynotes -f

# View Caddy / certificate logs
journalctl -u caddy-mynotes -f

# Stop both services
sudo systemctl stop mynotes caddy-mynotes

# Start both services
sudo systemctl start mynotes caddy-mynotes

# Check service status
sudo systemctl status mynotes caddy-mynotes
```

### How it works

Two systemd unit files are installed from the `deploy/` directory:

| Service | File | What it does |
|---|---|---|
| `mynotes` | `mynotes.service` | Runs `node dist/index.js` on port 3000, loads secrets from `/etc/mynotes/env` |
| `caddy-mynotes` | `caddy-mynotes.service` | Runs Caddy with `Caddyfile.local`, reverse-proxies port 443 → 3000, handles Let's Encrypt |

Secrets are stored in `/etc/mynotes/env` (readable only by root and the app
user) — never in the repo.

---

## Option B — Docker + Let's Encrypt (trusted certificate)

**Requirement:** Ports **80** and **443** must be reachable from the internet.

### Router port forwarding

| External port | Internal IP | Internal port | Protocol |
|---|---|---|---|
| 80 | `<Pi LAN IP>` | 80 | TCP |
| 443 | `<Pi LAN IP>` | 443 | TCP |

### One-command setup

```bash
# Install Docker (if not already installed)
sudo apt update && sudo apt install -y docker.io docker-compose-plugin
sudo usermod -aG docker $USER && newgrp docker

# Clone the repo
git clone https://github.com/nzicecool/mynotes.git
cd mynotes/deploy

chmod +x setup.sh
./setup.sh
```

`setup.sh` auto-detects your Pi's IP, creates `deploy/.env`, and runs
`docker compose up -d --build`. Caddy obtains a certificate automatically.

### Updating to a new version

```bash
cd mynotes/deploy
./setup.sh   # pulls latest code and rebuilds the Docker image
```

### Useful commands

```bash
docker compose logs -f          # all logs
docker compose logs -f caddy    # certificate / access logs
docker compose logs -f app      # app logs
docker compose down             # stop everything
docker compose up -d --build    # rebuild and restart
```

---

## Option C — Docker + Self-signed Certificate (no port forwarding)

Use this when your Pi is behind a strict NAT or your ISP blocks port 80.

```bash
# Install Docker (if not already installed)
sudo apt update && sudo apt install -y docker.io docker-compose-plugin
sudo usermod -aG docker $USER && newgrp docker

# Clone the repo
git clone https://github.com/nzicecool/mynotes.git
cd mynotes/deploy

# Create deploy/.env from the template
cp env-example.txt .env
# Edit .env — set MYNOTES_DOMAIN=mynotes.192.168.x.x.nip.io and other secrets

docker compose -f docker-compose.selfsigned.yml up -d --build
```

Open `https://mynotes.<YOUR_PI_IP>.nip.io` and accept the certificate warning,
or install the Caddy root CA on your devices to trust it permanently:

```bash
# Export the Caddy root CA
docker compose -f docker-compose.selfsigned.yml exec caddy \
  cat /data/caddy/pki/authorities/local/root.crt > caddy-root-ca.crt
```

| OS | Install steps |
|---|---|
| **macOS** | Double-click `caddy-root-ca.crt` → Keychain Access → Trust → Always Trust |
| **Windows** | Double-click → Install Certificate → Local Machine → Trusted Root CAs |
| **Android** | Settings → Security → Install from storage → CA certificate |
| **iOS/iPadOS** | AirDrop or email the file → Settings → General → VPN & Device Management → Trust |
| **Linux** | `sudo cp caddy-root-ca.crt /usr/local/share/ca-certificates/ && sudo update-ca-certificates` |

---

## Troubleshooting

| Problem | Cause | Fix |
|---|---|---|
| Certificate not issued | Port 80/443 not reachable from internet | Check router port forwarding; use Option C instead |
| `ERR_CONNECTION_REFUSED` | App not started | Check `journalctl -u mynotes` or `docker compose logs app` |
| `NET::ERR_CERT_AUTHORITY_INVALID` | Self-signed cert not trusted | Click "Advanced → Proceed", or install the Caddy root CA |
| App loads but login fails | OAuth redirect URL mismatch | Ensure `VITE_APP_ID` matches the domain registered in Manus OAuth settings |
| nip.io domain not resolving | DNS not propagated | Wait 30 seconds; nip.io is instant but some resolvers cache aggressively |
| `ENOENT: patches/wouter@3.7.1.patch` | Old clone missing the patches directory | Run `git pull` then retry the build |
| Build very slow on Pi (Docker) | Large build context | Ensure `.dockerignore` is present at the project root |
| `Cannot find package 'vite'` (Docker) | Old image cached without full node_modules | Run `docker compose build --no-cache` |
| Node.js version too old (native) | Node < 20 installed | The setup script installs Node 20 LTS automatically |
