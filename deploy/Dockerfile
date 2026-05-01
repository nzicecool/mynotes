# ── Stage 1: build ────────────────────────────────────────────────────────────
# Installs all dependencies, builds the frontend (Vite) and bundles the
# backend (esbuild --packages=external).
#
# NOTE: The server bundle uses --packages=external, which means node_modules
# are NOT inlined — they are required at runtime. The server/_core/vite.ts
# module is always imported (even in production mode it is tree-shaken at
# runtime via the NODE_ENV guard), so vite and its plugins must remain in
# node_modules. For this reason we copy the full node_modules to the runtime
# stage rather than running a separate --prod install.
FROM node:20-alpine AS builder

WORKDIR /app

# Pin the exact pnpm version from package.json#packageManager
ENV PNPM_VERSION=10.4.1
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

# Copy dependency manifests first for layer caching
COPY package.json pnpm-lock.yaml ./

# Install ALL dependencies (dev + prod) — vite/esbuild are needed for build
# and vite is also imported by the server bundle at runtime
RUN pnpm install --frozen-lockfile

# Copy full source
COPY . .

# Build: Vite (frontend -> dist/public) + esbuild (server -> dist/index.js)
RUN pnpm build

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
# Lean image: built artefacts + full node_modules (vite is a runtime dep here)
FROM node:20-alpine AS runtime

WORKDIR /app

# Copy the full node_modules from builder.
# We cannot prune --prod because the server bundle imports vite at the module
# level (server/_core/vite.ts) even though it is only called in dev mode.
COPY --from=builder /app/node_modules ./node_modules

# Copy built artefacts
COPY --from=builder /app/dist ./dist

# Copy package.json so Node can resolve the "type" field (ESM/CJS)
COPY --from=builder /app/package.json ./package.json

# Expose app port (PORT env var overrides; default 3000)
EXPOSE 3000

# Run in production mode so the server uses serveStatic (not Vite dev server)
ENV NODE_ENV=production

# Start the server
CMD ["node", "dist/index.js"]
