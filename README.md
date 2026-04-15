# MyNotes

**MyNotes** is a secure, self-hosted note-taking application with end-to-end encryption, multiple note types, offline support, and real-time synchronisation across devices. All note content is encrypted client-side using AES-256-GCM before it ever reaches the server — your password and plaintext notes never leave your browser.

---

## Features

| Feature | Description |
|---|---|
| **End-to-end encryption** | AES-256-GCM encryption with PBKDF2 key derivation. The server only ever stores ciphertext. |
| **6 note types** | Plain Text, Rich Text (TipTap), Markdown (live preview), Checklist, Code (syntax highlighting), Spreadsheet |
| **Local authentication** | Self-hosted email/password auth with bcrypt (12 rounds) and JWT session tokens. No external auth provider required. |
| **Password reset** | Secure token-based reset flow with optional SMTP email delivery and console fallback for local deployments. |
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
| Database | MySQL / TiDB (via Drizzle ORM) |
| Auth | bcryptjs, JWT (jose), HTTP-only cookies |
| Email | Nodemailer (optional SMTP) |
| Testing | Vitest |
| Package manager | pnpm |

---

## Prerequisites

Before running MyNotes locally, ensure you have the following installed:

- **Node.js** v22 or later — [nodejs.org](https://nodejs.org)
- **pnpm** v10 or later — `npm install -g pnpm`
- **MySQL** 8.0+ (or a compatible database such as TiDB, PlanetScale, or a Docker MySQL container)

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

Copy the example environment file and fill in your values:

```bash
cp .env.example .env
```

Open `.env` and set at minimum:

```env
DATABASE_URL=mysql://user:password@localhost:3306/mynotes
JWT_SECRET=your_long_random_secret_here
```

See the [Environment Variables](#environment-variables) section below for a full reference.

### 4. Set up the database

Run the Drizzle migrations to create all required tables:

```bash
pnpm db:push
```

### 5. Start the development server

```bash
pnpm dev
```

The application will be available at **http://localhost:3000**.

### 6. Create your first account

Navigate to `http://localhost:3000/register` to create an account, then set up your encryption password at `/setup`.

---

## Environment Variables

All environment variables are documented in `.env.example`. The table below describes each one.

### Required

| Variable | Description |
|---|---|
| `DATABASE_URL` | MySQL connection string, e.g. `mysql://user:pass@localhost:3306/mynotes` |
| `JWT_SECRET` | Secret used to sign JWT session tokens. Use a random string of at least 32 characters. Generate one with: `openssl rand -hex 32` |

### Optional — SMTP (Password Reset Emails)

If `SMTP_HOST` is not set, password reset links are printed to the **server console** instead. This is the recommended approach for local or air-gapped deployments.

| Variable | Default | Description |
|---|---|---|
| `SMTP_HOST` | _(unset)_ | SMTP server hostname, e.g. `smtp.gmail.com` |
| `SMTP_PORT` | `587` | SMTP port. Use `465` for SSL, `587` for STARTTLS. |
| `SMTP_SECURE` | `false` | Set to `true` when using port 465 (SSL). |
| `SMTP_USER` | _(unset)_ | SMTP authentication username / email address. |
| `SMTP_PASS` | _(unset)_ | SMTP authentication password or app password. |
| `SMTP_FROM` | `MyNotes <noreply@mynotes.local>` | The "From" address shown in reset emails. |

---

## Configuring SMTP for Password Reset Emails

MyNotes supports any standard SMTP server. Below are example configurations for common providers.

### Gmail (App Password)

Google requires an [App Password](https://support.google.com/accounts/answer/185833) when 2-Step Verification is enabled.

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your.address@gmail.com
SMTP_PASS=your_16_char_app_password
SMTP_FROM=MyNotes <your.address@gmail.com>
```

### Outlook / Microsoft 365

```env
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your.address@outlook.com
SMTP_PASS=your_password
SMTP_FROM=MyNotes <your.address@outlook.com>
```

### Self-hosted (e.g. Postfix, Mailcow, Mailu)

```env
SMTP_HOST=mail.yourdomain.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=noreply@yourdomain.com
SMTP_PASS=your_smtp_password
SMTP_FROM=MyNotes <noreply@yourdomain.com>
```

### No email server (console fallback)

If `SMTP_HOST` is not set, the reset URL is logged to stdout in a clearly marked block:

```
============================================================
[PasswordReset] Reset link for: user@example.com
[PasswordReset] URL: http://localhost:3000/reset-password?token=...&uid=1
[PasswordReset] Expires at: 2026-04-15T09:00:00.000Z
============================================================
```

Copy the URL from the console and open it in a browser to complete the reset.

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
├── drizzle/                 # Database schema and migration files
├── server/                  # Express + tRPC backend
│   ├── _core/               # Auth, context, session, SMTP helpers
│   ├── db.ts                # Database query helpers
│   └── routers.ts           # tRPC procedure definitions
├── shared/                  # Shared constants and types
├── .env.example             # Environment variable template
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
- [ ] Docker Compose setup for easy self-hosting

---

## License

This project is released under the [MIT License](LICENSE).
