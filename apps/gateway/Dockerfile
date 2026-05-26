FROM node:22-alpine AS base
RUN npm install -g pnpm turbo

# ── Stage 1: Prune monorepo to gateway + its workspace deps ──────────────────
FROM base AS pruner
WORKDIR /app
COPY . .
RUN turbo prune @nublestation/gateway --docker

# ── Stage 2: Install deps from pruned lockfile ───────────────────────────────
FROM base AS installer
WORKDIR /app
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile

# ── Stage 3: Create standalone deployment (resolves workspace deps) ───────────
FROM installer AS deployer
WORKDIR /app
COPY --from=pruner /app/out/full/ .
RUN pnpm --filter @nublestation/gateway deploy --prod /deploy

# ── Stage 4: Runner ───────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN npm install -g tsx \
 && addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nodeapp

COPY --from=deployer --chown=nodeapp:nodejs /deploy .

USER nodeapp
EXPOSE 3000
CMD ["tsx", "src/index.ts"]
