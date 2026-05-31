FROM node:22-alpine AS base
RUN npm install -g pnpm turbo

# ── Stage 1: Prune monorepo to vault + its workspace deps ─────────────────────
FROM base AS pruner
WORKDIR /app
COPY . .
RUN turbo prune @nublestation/vault-service --docker

# ── Stage 2: Install deps from pruned lockfile ────────────────────────────────
FROM base AS installer
WORKDIR /app
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile

# ── Stage 3: Create standalone deployment (resolves workspace deps) ───────────
FROM installer AS deployer
WORKDIR /app
COPY --from=pruner /app/out/full/ .
RUN pnpm --filter @nublestation/vault-service deploy --prod /deploy

# ── Stage 4: Runner ───────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN npm install -g tsx \
 && addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nodeapp \
 && mkdir -p /var/nuble/storage \
 && chown -R nodeapp:nodejs /var/nuble/storage

COPY --from=deployer --chown=nodeapp:nodejs /deploy .

USER nodeapp
EXPOSE 3003
CMD ["tsx", "src/index.ts"]
