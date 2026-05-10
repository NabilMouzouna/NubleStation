# syntax=docker/dockerfile:1.7
# Build context is the monorepo root (see infra/docker-compose.yml).

FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

# ---- deps: install workspace dependencies ----
FROM base AS deps
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY apps/console/package.json ./apps/console/
COPY packages/eslint-config/package.json ./packages/eslint-config/
COPY packages/typescript-config/package.json ./packages/typescript-config/
COPY packages/ui/package.json ./packages/ui/
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @repo/console...

# ---- builder: build the Next.js standalone output ----
FROM base AS builder
WORKDIR /repo
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /repo/node_modules ./node_modules
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json .npmrc ./
COPY packages ./packages
COPY apps/console ./apps/console
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @repo/console... \
 && pnpm --filter @repo/console build

# ---- runner: thin image with only the standalone bundle ----
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

# outputFileTracingRoot=../.. emits the standalone bundle rooted at /repo,
# so the entrypoint is apps/console/server.js inside the bundle.
COPY --from=builder --chown=nextjs:nodejs /repo/apps/console/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /repo/apps/console/.next/static ./apps/console/.next/static
COPY --from=builder --chown=nextjs:nodejs /repo/apps/console/public ./apps/console/public

USER nextjs
EXPOSE 3000
CMD ["node", "apps/console/server.js"]
