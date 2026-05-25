FROM node:20-alpine AS base
RUN npm install -g pnpm turbo

# ── Stage 1: Prune monorepo to console-only subset ──────────────────────────
FROM base AS pruner
WORKDIR /app
COPY . .
RUN turbo prune @nublestation/console --docker

# ── Stage 2: Install dependencies (using pruned lockfile) ────────────────────
FROM base AS installer
WORKDIR /app
# python3 + make + g++ are required by node-gyp to compile native addons
# (better-sqlite3, @node-rs/argon2)
RUN apk add --no-cache python3 make g++
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile

# ── Stage 3: Build ───────────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app
COPY --from=installer /app/node_modules ./node_modules
COPY --from=installer /app/apps/console/node_modules ./apps/console/node_modules
COPY --from=pruner /app/out/full/ .
RUN turbo run build --filter=@nublestation/console

# ── Stage 4: Runner (minimal) ────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

# standalone output already includes its own node_modules — no full install needed
COPY --from=builder --chown=nextjs:nodejs /app/apps/console/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/console/.next/static ./apps/console/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/console/public ./apps/console/public

USER nextjs
EXPOSE 3000

CMD ["node", "apps/console/server.js"]
