# MyNotes

[![GitHub Pages](https://img.shields.io/badge/Landing%20Page-Live-4f46e5?style=flat-square&logo=github)](https://nzicecool.github.io/mynotes/)
[![GitHub stars](https://img.shields.io/github/stars/nzicecool/mynotes?style=flat-square&logo=github)](https://github.com/nzicecool/mynotes/stargazers)
[![License: MIT](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)

**MyNotes** is a secure, self-hosted note-taking application with end-to-end encryption, multiple note types, offline support, and real-time synchronisation across devices. All note content is encrypted client-side using AES-256-GCM before it ever reaches the server — your password and plaintext notes never leave your browser.

---

## Features

| Feature | Description |
|---|---|
| **End-to-end encryption** | AES-256-GCM encryption with PBKDF2 key derivation. The server only ever stores ciphertext. |
| **6 note types** | Plain Text, Rich Text (TipTap), Markdown (live preview), Checklist, Code (syntax highlighting), Spreadsheet |
| **Local authentication** | Self-hosted email/password auth with bcrypt (12 rounds) and JWT session tokens. No external auth provider required. |
| **Password reset** | Secure token-based reset flow with AgentMail.to (primary), optional SMTP fallback, and console fallback for air-gapped deployments. |
| **Offline-first** | IndexedDB local storage with a sync queue for changes made while offline. |
| **Tags & folders** | Organise notes with nested folders and multi-tag support. |
| **Revision history** | Automatic versioning on every save with the ability to view previous versions. |
| **Full-text search** | Search across note titles and content from the dashboard sidebar. |
| **Pinning & archiving** | Pin important notes to the top; archive notes you no longer need daily access to. |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Tailwind CSS 4, shadcn/ui, TipTap, Wouter |
| Backend | Node.js 22, Express 4, tRPC 11 |
| Database | MySQL 8 **or** SQLite 3 (selectable via `DATABASE_DRIVER` env var) |
| Auth | bcryptjs, JWT (jose), HTTP-only cookies |
| Email | AgentMail.to (primary), Nodemailer/SMTP (fallback) |
| Testing | Vitest |
| Package manager | pnpm |
| Container | Docker (multi-arch: amd64, arm64, arm/v7) |
| Orchestration | k3s / Kubernetes |

---

## Prerequisites

- **Node.js** v22 or later — [nodejs.org](https://nodejs.org)
- **pnpm** v10 or later — `npm install -g pnpm`
- **MySQL** 8.0+ — for multi-user / server deployments
- **SQLite** — built-in, zero-setup; recommended for Raspberry Pi and single-user deployments (no MySQL needed)

---

## Local Setup

### 1. Clone the repository

```bash
git clone https://github.com/nzicecool/mynotes.git
cd mynotes
```

### 2. Install dependencies

```bash
pnpm install
```

### 3. Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and choose your database backend:

**MySQL (default — recommended for multi-user / server deployments):**
```env
DATABASE_DRIVER=mysql
DATABASE_URL=mysql://user:password@localhost:3306/mynotes
JWT_SECRET=your_long_random_secret_here
```

Generate a strong `JWT_SECRET` with:
```bash
openssl rand -hex 32
```

**SQLite (recommended for Raspberry Pi 3B, laptops, and single-user local deployments):**
```env
DATABASE_DRIVER=sqlite
SQLITE_PATH=./data/mynotes.db
JWT_SECRET=your_long_random_secret_here
```

No `DATABASE_URL` is required when using SQLite. The `./data/` directory is created automatically on first startup. If you prefer an explicit location (e.g. on an external drive), set `SQLITE_PATH` to an absolute path such as `/mnt/usb/mynotes.db`.

See the [Environment Variables](#environment-variables) section for a full reference.

### 4. Set up the database

**MySQL:** Push the Drizzle schema to your MySQL instance:
```bash
pnpm db:push
```
Ensure your MySQL server is running and the `DATABASE_URL` credentials are correct before running this command.

**SQLite:** No migration step is needed. The schema is created automatically when the server starts for the first time. You will see a log line similar to:
```
[Database] SQLite initialised at ./data/mynotes.db
```

### 5. Start the development server

```bash
pnpm dev
```

Open **http://localhost:3000**, navigate to `/register` to create your account, then set up your encryption password at `/setup`.

> **Tip:** For a production local build, run `pnpm build && pnpm start` instead of `pnpm dev`. The production server is significantly faster and does not include hot-reload overhead.

---

## Environment Variables

All variables are documented in `.env.example`.

### Required

| Variable | Description |
|---|---|
| `DATABASE_DRIVER` | `mysql` (default) or `sqlite`. Selects the database backend. |
| `DATABASE_URL` | MySQL connection string. Required when `DATABASE_DRIVER=mysql`. e.g. `mysql://user:pass@localhost:3306/mynotes` |
| `SQLITE_PATH` | Path to the SQLite database file. Used when `DATABASE_DRIVER=sqlite`. Default: `./data/mynotes.db` |
| `JWT_SECRET` | Secret for signing JWT tokens. Generate with: `openssl rand -hex 32` |

### Email — AgentMail.to (Recommended)

[AgentMail.to](https://agentmail.to) is the primary email provider for password reset. It requires no SMTP server and works out of the box.

| Variable | Description |
|---|---|
| `AGENTMAIL_API_KEY` | Your AgentMail API key from [console.agentmail.to](https://console.agentmail.to) |
| `AGENTMAIL_INBOX_ID` | _(Optional)_ A pre-created inbox ID. If unset, one is created automatically on first use. |
| `AGENTMAIL_INBOX_USERNAME` | _(Optional)_ Username for the auto-created inbox. Defaults to `mynotes-noreply`. |

### Email — SMTP Fallback (Optional)

If `AGENTMAIL_API_KEY` is not set or AgentMail delivery fails, MyNotes falls back to SMTP. If neither is configured, reset links are printed to the server console.

| Variable | Default | Description |
|---|---|---|
| `SMTP_HOST` | _(unset)_ | SMTP server hostname, e.g. `smtp.gmail.com` |
| `SMTP_PORT` | `587` | SMTP port. Use `465` for SSL, `587` for STARTTLS. |
| `SMTP_SECURE` | `false` | Set to `true` when using port 465 (SSL). |
| `SMTP_USER` | _(unset)_ | SMTP authentication username / email address. |
| `SMTP_PASS` | _(unset)_ | SMTP authentication password or app password. |
| `SMTP_FROM` | `MyNotes <noreply@mynotes.local>` | The "From" address shown in reset emails. |

---

## Configuring Email for Password Reset

### Option 1: AgentMail.to (Recommended)

AgentMail.to provides a simple REST API for sending transactional emails — no SMTP server required.

1. Sign up at [agentmail.to](https://agentmail.to) and obtain your API key from the [console](https://console.agentmail.to).
2. Add the following to your `.env`:

```env
AGENTMAIL_API_KEY=am_your_api_key_here
# Optional: pre-create an inbox and set its ID to avoid auto-creation on startup
AGENTMAIL_INBOX_ID=your_inbox_id_here
```

MyNotes will automatically create a dedicated `mynotes-noreply` inbox on first use if `AGENTMAIL_INBOX_ID` is not set. The inbox ID is cached in memory for the lifetime of the process.

### Option 2: SMTP (Fallback)

#### Gmail (App Password)

Google requires an [App Password](https://support.google.com/accounts/answer/185833) when 2-Step Verification is enabled.

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your.address@gmail.com
SMTP_PASS=your_16_char_app_password
SMTP_FROM=MyNotes <your.address@gmail.com>
```

#### Outlook / Microsoft 365

```env
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your.address@outlook.com
SMTP_PASS=your_password
SMTP_FROM=MyNotes <your.address@outlook.com>
```

#### Self-hosted (Postfix, Mailcow, Mailu)

```env
SMTP_HOST=mail.yourdomain.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=noreply@yourdomain.com
SMTP_PASS=your_smtp_password
SMTP_FROM=MyNotes <noreply@yourdomain.com>
```

### Option 3: Console Fallback (Air-gapped / Local)

If neither AgentMail nor SMTP is configured, the reset URL is logged to stdout:

```
============================================================
[PasswordReset] Reset link for: user@example.com
[PasswordReset] URL: http://localhost:3000/reset-password?token=...&uid=1
[PasswordReset] Expires at: 2026-04-15T09:00:00.000Z
============================================================
```

Copy the URL from the console and open it in a browser to complete the reset.

---

## Deployment

### Option 1: Docker Compose — MySQL (Recommended for multi-user / server deployments)

The included `docker-compose.yml` starts MyNotes and MySQL together with a single command.

```bash
# 1. Copy and edit the environment file
cp .env.example .env
# Edit .env — set JWT_SECRET, MYSQL_PASSWORD, and optionally AGENTMAIL_API_KEY

# 2. Build the image
docker compose build

# 3. Start all services
docker compose up -d

# 4. Run database migrations
docker compose exec app node -e "process.exit(0)"   # wait for app to be ready
# Then in a separate terminal:
docker compose exec app sh -c "cd /app && node dist/index.js &"
# Or simply visit http://localhost:3000 — migrations run automatically on startup

# 5. Open the app
open http://localhost:3000
```

To stop: `docker compose down`  
To stop and remove data: `docker compose down -v`

### Option 1b: Docker Compose — SQLite (Recommended for Raspberry Pi 3B / single-user)

The included `docker-compose.pi.yml` runs a **single container** with SQLite. No separate database container is needed, making it ideal for the Pi 3B's 1 GB RAM.

```bash
# 1. Copy and edit the Pi environment file
cp .env.example .env.pi
nano .env.pi   # set JWT_SECRET and optionally AGENTMAIL_API_KEY

# 2. Build the ARM32v7 image on your workstation
docker buildx create --use --name mybuilder
docker buildx build --platform linux/arm/v7 -t mynotes:latest --load .

# 3. Transfer to the Pi
docker save mynotes:latest | ssh pi@raspberrypi.local "docker load"

# 4. On the Pi, start with the Pi Compose file
ssh pi@raspberrypi.local
git clone https://github.com/nzicecool/mynotes.git && cd mynotes
docker compose -f docker-compose.pi.yml --env-file .env.pi up -d

# 5. Open http://raspberrypi.local:3000
```

**Backup your SQLite database:**
```bash
docker compose -f docker-compose.pi.yml cp mynotes:/app/data/mynotes.db ./backup-$(date +%Y%m%d).db
```

**Restore from backup:**
```bash
docker compose -f docker-compose.pi.yml stop
docker compose -f docker-compose.pi.yml cp ./backup.db mynotes:/app/data/mynotes.db
docker compose -f docker-compose.pi.yml start
```

---

### Option 2: Raspberry Pi 3B — Standalone Docker

If you prefer to run containers individually without Docker Compose, you have two sub-options depending on whether you want MySQL or the lighter SQLite backend.

#### Option 2a: SQLite (Recommended for Pi 3B — single container, ~330 MB RAM)

SQLite requires no separate database container, making it the best fit for the Pi 3B's 1 GB RAM. The database is stored as a single file in a named Docker volume.

```bash
# 1. Build the MyNotes image for ARMv7 (run on your workstation with buildx)
docker buildx build --platform linux/arm/v7 -t mynotes:latest --load .

# 2. Transfer the image to the Pi
docker save mynotes:latest | ssh pi@raspberrypi.local "docker load"

# 3. On the Pi — create a named volume for the SQLite database file
ssh pi@raspberrypi.local
docker volume create mynotes_sqlite_data

# 4. Start the app (single container, no network needed)
docker run -d \
  --name mynotes-app \
  --restart unless-stopped \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e DATABASE_DRIVER=sqlite \
  -e SQLITE_PATH=/app/data/mynotes.db \
  -e JWT_SECRET="$(openssl rand -hex 32)" \
  -e AGENTMAIL_API_KEY="your_agentmail_key" \
  -v mynotes_sqlite_data:/app/data \
  mynotes:latest

# 5. Open http://raspberrypi.local:3000
```

**Backup your SQLite database:**
```bash
docker cp mynotes-app:/app/data/mynotes.db ./backup-$(date +%Y%m%d).db
```

**Restore from backup:**
```bash
docker stop mynotes-app
docker cp ./backup.db mynotes-app:/app/data/mynotes.db
docker start mynotes-app
```

**Resource usage (SQLite, Pi 3B):**

| Component | Approx. RAM |
|---|---|
| mynotes-app | ~150–200 MB |
| OS + Docker daemon | ~200 MB |
| **Total** | **~350–400 MB** |

This leaves ~600 MB free on the Pi 3B — comfortable headroom for the OS and other lightweight services.

---

#### Option 2b: MySQL / MariaDB (Two containers — use when you need multi-user concurrency)

If you need MySQL for a shared or multi-user deployment, run MariaDB (ARM32v7-compatible) alongside the app:

```bash
# 1. Create a Docker network
docker network create mynotes-net

# 2. Start MariaDB (ARM32v7 compatible)
docker run -d \
  --name mynotes-db \
  --network mynotes-net \
  --restart unless-stopped \
  -e MYSQL_ROOT_PASSWORD=changeme_root \
  -e MYSQL_DATABASE=mynotes \
  -e MYSQL_USER=mynotes \
  -e MYSQL_PASSWORD=changeme \
  -v mynotes_db_data:/var/lib/mysql \
  --innodb-buffer-pool-size=128M \
  --max-connections=50 \
  mariadb:10.11

# 3. Build the MyNotes image for ARMv7 (on your workstation)
docker buildx build --platform linux/arm/v7 -t mynotes:latest --load .

# 4. Transfer to the Pi and start the app
docker save mynotes:latest | ssh pi@raspberrypi.local "docker load"
ssh pi@raspberrypi.local

docker run -d \
  --name mynotes-app \
  --network mynotes-net \
  --restart unless-stopped \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e DATABASE_DRIVER=mysql \
  -e DATABASE_URL="mysql://mynotes:changeme@mynotes-db:3306/mynotes" \
  -e JWT_SECRET="your_long_random_secret" \
  -e AGENTMAIL_API_KEY="your_agentmail_key" \
  mynotes:latest

# 5. Open http://raspberrypi.local:3000
```

**Resource usage (MySQL, Pi 3B):**

| Component | Approx. RAM |
|---|---|
| mynotes-app | ~150–200 MB |
| MariaDB (tuned) | ~200–300 MB |
| OS + Docker daemon | ~200 MB |
| **Total** | **~550–700 MB** |

> **Tip:** The `--innodb-buffer-pool-size=128M --max-connections=50` flags are critical on the Pi 3B. Without them, MariaDB may consume 400+ MB and leave insufficient RAM for the app.

---

### Option 3: k3s (Kubernetes on Raspberry Pi)

For a production-grade self-hosted deployment using k3s, refer to the dedicated guide:

**[deploy/k3s/README.md](deploy/k3s/README.md)**

The k3s manifests in `deploy/k3s/` include:

| File | Purpose |
|---|---|
| `00-namespace.yaml` | Creates the `mynotes` Kubernetes namespace |
| `01-secrets.yaml` | Secrets template (replace placeholders before applying) |
| `02-mysql.yaml` | MySQL StatefulSet with PVC, tuned for Pi 3B memory constraints |
| `03-app.yaml` | MyNotes Deployment with health checks and resource limits |
| `04-ingress.yaml` | Traefik Ingress for HTTP/HTTPS access |

Quick start:

```bash
# Install k3s on the Pi
curl -sfL https://get.k3s.io | sh -

# Apply manifests
kubectl apply -f deploy/k3s/00-namespace.yaml
kubectl apply -f deploy/k3s/ -n mynotes

# Watch the rollout
kubectl rollout status deployment/mynotes-app -n mynotes
```

---

## Available Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Start the development server with hot reload |
| `pnpm build` | Build the production bundle |
| `pnpm start` | Start the production server (requires `pnpm build` first) |
| `pnpm test` | Run all Vitest unit tests |
| `pnpm db:push` | Generate and apply Drizzle schema migrations |
| `pnpm check` | Run TypeScript type checking |
| `pnpm format` | Format all files with Prettier |

---

## Project Structure

```
mynotes/
├── client/                  # React frontend (Vite)
│   └── src/
│       ├── components/      # Reusable UI components and note editors
│       │   └── editors/     # RichTextEditor, MarkdownEditor, ChecklistEditor, etc.
│       ├── lib/             # Encryption, offline storage, tRPC client
│       └── pages/           # Route-level page components
├── deploy/
│   └── k3s/                 # Kubernetes manifests + deployment guide
├── drizzle/                 # Database schema and migration files
├── server/                  # Express + tRPC backend
│   ├── _core/               # Auth, context, session, AgentMail, SMTP helpers
│   ├── db.ts                # Database query helpers
│   └── routers.ts           # tRPC procedure definitions
├── shared/                  # Shared constants and types
├── .env.example             # Environment variable template
├── Dockerfile               # Multi-arch Docker build (amd64, arm64, arm/v7)
├── docker-compose.yml       # Docker Compose for easy self-hosting
└── todo.md                  # Development task tracker
```

---

## Security Model

MyNotes is designed with a **zero-knowledge** approach to note storage:

1. When you set up your account, you choose an **encryption password**. This password is used to derive an AES-256 key via PBKDF2 (with a random per-user salt stored on the server).
2. All note content is **encrypted in the browser** before being sent to the server. The server stores only ciphertext.
3. Your encryption password is **never transmitted** to the server.
4. Session authentication uses a separate **login password** (bcrypt-hashed) and a JWT cookie — this is independent of your encryption password.

> **Important:** If you forget your encryption password, your notes cannot be recovered. There is no server-side key escrow by design.

---

## Contributing

Contributions are welcome. Please follow these steps:

1. Fork the repository and create a feature branch: `git checkout -b feature/your-feature-name`
2. Make your changes and ensure all tests pass: `pnpm test`
3. Run type checking: `pnpm check`
4. Format your code: `pnpm format`
5. Open a pull request with a clear description of the change and the motivation behind it.

Please do not commit `.env` files or any credentials. The `.gitignore` is configured to prevent this, but always double-check before pushing.

---

## Roadmap

- [ ] Real-time WebSocket synchronisation across devices
- [ ] Tag filtering panel in the sidebar
- [ ] Admin user management page
- [ ] Mobile-responsive layout
- [ ] Auto-save with debounce
- [ ] Note export (PDF, Markdown, plain text)
- [ ] Two-factor authentication (TOTP)
- [ ] GitHub Actions CI workflow

---

## License

This project is released under the [MIT License](LICENSE).
