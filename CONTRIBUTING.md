# Contributing to MyNotes

Thank you for your interest in contributing to MyNotes. This document explains how to get the project running locally, how to submit changes, and the conventions the codebase follows.

---

## Getting Started

### Prerequisites

- **Node.js** v20 or later
- **pnpm** v10 or later (`npm install -g pnpm`)
- **Git**

### Fork and clone

```bash
# 1. Fork the repo on GitHub, then clone your fork
git clone https://github.com/<your-username>/mynotes.git
cd mynotes

# 2. Add the upstream remote so you can pull future changes
git remote add upstream https://github.com/nzicecool/mynotes.git
```

### Install dependencies and start the dev server

```bash
pnpm install

# Start with SQLite (no external database needed)
DATABASE_DRIVER=sqlite JWT_SECRET=dev-secret pnpm dev
```

Open **http://localhost:3000**, register an account, and set up your encryption password.

---

## Project Structure

```
client/src/pages/     ← Page-level React components
client/src/components/← Reusable UI components (shadcn/ui based)
server/routers.ts     ← tRPC procedures (the API layer)
server/db.ts          ← Database query helpers
drizzle/schema.ts     ← Database schema (Drizzle ORM)
deploy/               ← Docker, Caddy, and systemd deployment files
docs/                 ← GitHub Pages landing page (static HTML)
```

---

## Making Changes

### Branching

Create a feature branch from `main`:

```bash
git checkout -b feat/my-feature
# or for bug fixes:
git checkout -b fix/issue-description
```

### Coding conventions

- **TypeScript everywhere** — no plain `.js` files in `client/` or `server/`.
- **tRPC for all API calls** — do not add raw Express routes for new features; define a procedure in `server/routers.ts` instead.
- **Drizzle for all database access** — do not write raw SQL; add a helper to `server/db.ts`.
- **shadcn/ui + Tailwind** for UI — avoid adding new CSS frameworks or component libraries.
- **No external crypto packages** — the encryption layer uses only the Web Crypto API (`crypto.subtle`). Do not add `@noble/*`, `crypto-js`, or similar.

### Database changes

If your change requires a schema update:

1. Edit `drizzle/schema.ts`.
2. Run `pnpm db:push` to apply the migration to your local database.
3. Commit both the schema file and the generated migration files in `drizzle/migrations/`.

### Tests

All server-side logic must have Vitest coverage. Run the test suite before opening a PR:

```bash
DATABASE_DRIVER=sqlite pnpm test
```

Tests live in `server/*.test.ts`. Follow the pattern in `server/auth.logout.test.ts` for new test files — each test file creates its own in-memory SQLite database and tears it down after the suite.

---

## Submitting a Pull Request

1. Ensure all tests pass: `DATABASE_DRIVER=sqlite pnpm test`
2. Ensure the production build succeeds: `pnpm build`
3. Push your branch and open a PR against `main` on the upstream repo.
4. Fill in the PR description: what changed, why, and how to test it.
5. A maintainer will review and merge or request changes.

---

## Reporting Issues

Use [GitHub Issues](https://github.com/nzicecool/mynotes/issues) to report bugs or request features. Please include:

- Your operating system and Node.js version.
- The database driver you are using (`sqlite` or `mysql`).
- Steps to reproduce the issue.
- Any relevant error messages from the browser console or server logs (`journalctl -u mynotes -n 50`).

---

## Security

If you discover a security vulnerability, **do not open a public issue**. Instead, open a [GitHub Security Advisory](https://github.com/nzicecool/mynotes/security/advisories/new) or contact the maintainer directly. We will acknowledge the report within 48 hours and aim to release a fix within 7 days.

---

## Licence

By contributing, you agree that your contributions will be licensed under the [MIT Licence](LICENSE).
