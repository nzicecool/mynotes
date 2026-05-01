# MyNotes — HTTPS Setup for Raspberry Pi

This guide explains how to run MyNotes over HTTPS on a Raspberry Pi using
**Caddy** as a reverse proxy and **nip.io** as a free wildcard DNS service.
Two options are provided depending on whether your Pi is reachable from the
internet.

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

## Prerequisites

### 1. Install Docker and Docker Compose

```bash
sudo apt update
sudo apt install -y docker.io docker-compose-plugin
sudo usermod -aG docker $USER   # allow running docker without sudo
newgrp docker                   # apply group change in current shell
```

Verify the installation:

```bash
docker --version
docker compose version
```

### 2. Clone the repository

```bash
git clone https://github.com/nzicecool/mynotes.git
cd mynotes
```

---

## Option A — Let's Encrypt (trusted certificate, recommended)

**Requirement:** Ports **80** and **443** must be reachable from the internet
so Let's Encrypt can complete its HTTP-01 ACME challenge.

### Router port forwarding

Log in to your router and add two port-forward rules:

| External port | Internal IP | Internal port | Protocol |
|---|---|---|---|
| 80 | `<Pi LAN IP>` | 80 | TCP |
| 443 | `<Pi LAN IP>` | 443 | TCP |

### One-command setup

```bash
cd mynotes/deploy
chmod +x setup.sh
./setup.sh
```

The script will:
1. Auto-detect your Pi's LAN IP and set `MYNOTES_DOMAIN=mynotes.<IP>.nip.io`
2. Create a `deploy/.env` file and prompt for any missing secrets
3. Build the Docker image (Stage 1: `pnpm install` + `pnpm build`; Stage 2: copy artefacts)
4. Start the app + Caddy reverse proxy
5. Caddy obtains a Let's Encrypt certificate automatically (~30 seconds)

Open `https://mynotes.<YOUR_PI_IP>.nip.io` in your browser.

### Manual setup (if you prefer not to use the script)

```bash
cd mynotes/deploy

# 1. Create deploy/.env from the template
cp env-example.txt .env
# Edit .env — set MYNOTES_DOMAIN, DATABASE_URL, JWT_SECRET, etc.

# 2. Build and start
docker compose up -d --build

# 3. Watch logs
docker compose logs -f caddy
```

---

## Option B — Self-signed certificate (no port forwarding needed)

Use this when your Pi is behind a strict NAT, or your ISP blocks port 80.
Caddy generates its own internal CA and issues a self-signed certificate.

**Trade-off:** Browsers will show a security warning on first visit. You can
click "Advanced → Proceed" to accept it, or install the Caddy root CA on your
devices to trust it permanently (see below).

### Start with self-signed certificate

```bash
cd mynotes/deploy

# 1. Create deploy/.env — set MYNOTES_DOMAIN to your Pi's nip.io address
cp env-example.txt .env
# Edit: MYNOTES_DOMAIN=mynotes.192.168.1.50.nip.io

# 2. Start with the self-signed compose file
docker compose -f docker-compose.selfsigned.yml up -d --build
```

Open `https://mynotes.<YOUR_PI_IP>.nip.io` and accept the certificate warning.

### Trust the Caddy root CA (optional — removes the browser warning)

After starting the containers, export the Caddy root CA and install it on each
device you use to access MyNotes:

```bash
# Export the CA certificate
docker compose -f docker-compose.selfsigned.yml exec caddy \
  cat /data/caddy/pki/authorities/local/root.crt > caddy-root-ca.crt
```

**Install on each device:**

| OS | Steps |
|---|---|
| **macOS** | Double-click `caddy-root-ca.crt` → Keychain Access → Trust → Always Trust |
| **Windows** | Double-click → Install Certificate → Local Machine → Trusted Root CAs |
| **Android** | Settings → Security → Install from storage → CA certificate |
| **iOS/iPadOS** | AirDrop or email the file → Settings → General → VPN & Device Management → Trust |
| **Linux** | `sudo cp caddy-root-ca.crt /usr/local/share/ca-certificates/ && sudo update-ca-certificates` |

---

## How the Docker build works

The `Dockerfile` uses a two-stage build:

| Stage | What happens |
|---|---|
| **Stage 1 (builder)** | `pnpm install` (all deps) → `pnpm build` (Vite frontend + esbuild server) |
| **Stage 2 (runtime)** | Copies `node_modules/` + `dist/` from Stage 1; sets `NODE_ENV=production` |

**Why copy the full `node_modules`?** The server bundle uses
`esbuild --packages=external`, so all packages remain as runtime imports.
The `server/_core/vite.ts` module is always present in the bundle (it is
guarded by `NODE_ENV` at runtime, not at build time), so `vite` and its
plugins must exist in `node_modules` even in production.

A `.dockerignore` file at the project root excludes `node_modules/`, `dist/`,
`.git/`, and other large directories from the build context, so Docker only
sends source files to the build daemon — keeping the build fast on the Pi.

---

## Updating to a new version

```bash
cd mynotes
git pull
cd deploy
docker compose up -d --build   # rebuilds the image with the latest code
```

---

## Useful commands

```bash
# View all logs
docker compose logs -f

# View only Caddy logs (certificate renewal, access)
docker compose logs -f caddy

# View only app logs
docker compose logs -f app

# Stop everything
docker compose down

# Restart after a config change
docker compose restart caddy

# Check running containers
docker compose ps
```

---

## Troubleshooting

| Problem | Cause | Fix |
|---|---|---|
| Certificate not issued | Port 80/443 not reachable from internet | Check router port forwarding; use Option B instead |
| `ERR_CONNECTION_REFUSED` | App not started | Run `docker compose logs app` to check for errors |
| `NET::ERR_CERT_AUTHORITY_INVALID` | Self-signed cert not trusted | Click "Advanced → Proceed", or install the Caddy root CA |
| App loads but login fails | OAuth redirect URL mismatch | Ensure `VITE_APP_ID` matches the domain registered in Manus OAuth settings |
| nip.io domain not resolving | DNS not propagated | Wait 30 seconds; nip.io is instant but some resolvers cache aggressively |
| `Cannot find package 'vite'` | Old image cached without full node_modules | Run `docker compose build --no-cache` to force a clean rebuild |
| Build very slow on Pi | Large build context | Ensure `.dockerignore` is present at the project root |

---

## Security notes

- The `deploy/.env` file contains secrets — never commit it to version control.
  It is already listed in `.gitignore` and `.dockerignore`.
- Let's Encrypt certificates are renewed automatically by Caddy every 60 days.
- The Caddy container stores certificate data in a named Docker volume
  (`caddy_data`) — this persists across container restarts.
- For production use, consider restricting access to the app by IP range
  using Caddy's `remote_ip` matcher if the Pi is internet-facing.
