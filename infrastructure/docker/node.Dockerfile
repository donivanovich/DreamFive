# syntax=docker/dockerfile:1.7
# -----------------------------------------------------------------------------
# DREAM5 — imagen de las aplicaciones Node.js del monorepo.
#
# Un único Dockerfile multi-etapa genera tres imágenes de ejecución
# independientes mediante --target: `api`, `worker` y `web`.
#
#   docker build -f infrastructure/docker/node.Dockerfile --target api .
#
# Principios aplicados:
#   * Imagen oficial de Node.js con versión fijada (sin `latest`).
#   * Dependencias instaladas con lockfile congelado.
#   * Imágenes finales con solo dependencias de producción (`pnpm deploy`).
#   * Ejecución como usuario sin privilegios (`node`, UID 1000).
# -----------------------------------------------------------------------------

ARG NODE_IMAGE=node:24.22.3-alpine3.24

# --- Base: Node.js + pnpm (versión fijada por `packageManager`) ---------------
FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm \
    COREPACK_HOME=/pnpm/corepack \
    PATH=/pnpm:$PATH \
    CI=true
RUN corepack enable && mkdir -p /pnpm/corepack && chmod -R a+rX /pnpm
WORKDIR /repo

# --- Build: instala todo el workspace y compila -------------------------------
FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY apps/web/package.json apps/web/
COPY packages/config/package.json packages/config/
COPY packages/database/package.json packages/database/
COPY packages/shared/package.json packages/shared/
COPY packages/simulation-engine/package.json packages/simulation-engine/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile
COPY . .
ARG VITE_API_URL=http://localhost:3001
ARG VITE_DEV_TOOLS_ENABLED=false
ENV VITE_API_URL=${VITE_API_URL} \
    VITE_DEV_TOOLS_ENABLED=${VITE_DEV_TOOLS_ENABLED}
RUN pnpm run build \
 && pnpm --filter @dream5/api deploy --prod --legacy /out/api \
 && pnpm --filter @dream5/worker deploy --prod --legacy /out/worker \
 && pnpm --filter @dream5/web deploy --prod --legacy /out/web

# --- Migraciones automáticas al arrancar Compose ------------------------------
FROM build AS migrate
USER node
WORKDIR /repo/packages/database
CMD ["./node_modules/.bin/prisma", "migrate", "deploy"]

# --- Seed inicial automático al arrancar Compose ------------------------------
FROM build AS seed
USER node
WORKDIR /repo/packages/database
CMD ["node", "dist/seed.js"]

# --- Runtime común ------------------------------------------------------------
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production
RUN apk add --no-cache tini
WORKDIR /app
RUN mkdir -p /app/uploads && chown -R node:node /app/uploads
USER node
ENTRYPOINT ["/sbin/tini", "--"]

# --- API ---------------------------------------------------------------------
FROM runtime AS api
COPY --from=build --chown=root:root /out/api ./
EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.API_PORT||3001)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "dist/main.js"]

# --- Worker ------------------------------------------------------------------
FROM runtime AS worker
COPY --from=build --chown=root:root /out/worker ./
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "dist/healthcheck.js"]
CMD ["node", "dist/main.js"]

# --- Web (SSR) ---------------------------------------------------------------
FROM runtime AS web
COPY --from=build --chown=root:root /out/web ./
ENV PORT=3000 HOST=0.0.0.0
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node_modules/.bin/srvx", "--prod", "-s", "../client", "dist/server/server.js"]
