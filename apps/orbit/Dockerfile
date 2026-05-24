FROM node:20-alpine AS base
RUN npm install -g pnpm turbo

# ── Stage 1: Prune monorepo to orbit + its workspace deps ────────────────────
FROM base AS pruner
WORKDIR /app
COPY . .
RUN turbo prune @nublestation/orbit --docker

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
RUN pnpm --filter @nublestation/orbit deploy --prod /deploy

# ── Stage 4: Runner ───────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN npm install -g tsx \
 && addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nodeapp

COPY --from=deployer --chown=nodeapp:nodejs /deploy .

USER nodeapp
EXPOSE 3002
CMD ["tsx", "src/index.ts"]
