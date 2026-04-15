# ─────────────────────────────────────────────────────────────────────────────
# MyNotes — Multi-stage Dockerfile
#
# Supports the following platforms via Docker Buildx:
#   linux/amd64   — standard x86-64 servers / VMs
#   linux/arm64   — Raspberry Pi 4, Apple Silicon, AWS Graviton
#   linux/arm/v7  — Raspberry Pi 3B / 3B+ (ARMv7 32-bit)
#
# Build for Raspberry Pi 3B:
#   docker buildx build --platform linux/arm/v7 -t mynotes:latest .
#
# Build for all platforms and push:
#   docker buildx build --platform linux/amd64,linux/arm64,linux/arm/v7 \
#     -t your-registry/mynotes:latest --push .
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: Dependencies ─────────────────────────────────────────────────────
FROM node:22-alpine AS deps

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.4.1 --activate

WORKDIR /app

# Copy package manifests and lockfile
COPY package.json pnpm-lock.yaml ./
COPY patches/ ./patches/

# Install all dependencies (including devDependencies for the build step)
RUN pnpm install --frozen-lockfile

# ── Stage 2: Build ────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@10.4.1 --activate

WORKDIR /app

# Copy node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy full source
COPY . .

# Build frontend (Vite) + backend (esbuild)
RUN pnpm build

# ── Stage 3: Production image ─────────────────────────────────────────────────
FROM node:22-alpine AS runner

# Install dumb-init for proper signal handling (important on Pi)
RUN apk add --no-cache dumb-init

# Create a non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser  -u 1001 -S mynotes -G nodejs

WORKDIR /app

# Copy only what is needed to run
COPY --from=builder --chown=mynotes:nodejs /app/dist      ./dist
COPY --from=builder --chown=mynotes:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=mynotes:nodejs /app/package.json ./package.json

# The Vite build output is served as static files by the Express server
COPY --from=builder --chown=mynotes:nodejs /app/client/dist ./client/dist

USER mynotes

# Expose the application port (the server reads PORT from env, defaults to 3000)
EXPOSE 3000

# Health check — lightweight ping to the API
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

# Use dumb-init to handle PID 1 signals correctly
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
