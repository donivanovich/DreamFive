# DreamFive

**DreamFive** es un juego _fantasy_ de gestión deportiva de baloncesto Full Stack preparado para operar **24/7**, con ligas privadas completamente aisladas entre sí, simulación automática de partidos, economía dinámica, lesiones, expulsiones, progresión de jugadores, traspasos con garantías ACID y competición mensual por temporadas.

> **Estado actual:** **Prototipo funcional Full Stack completamente dockerizado** conectado a PostgreSQL 18, Redis 8, envío SMTP real configurable (Gmail / SMTP), NestJS (Fastify + Socket.IO), Worker 24/7 BullMQ, motor de simulación determinista en TypeScript puro y aplicación web React + TanStack Start + TanStack Query.

---

## Características implementadas

- **Autenticación y verificación real por correo:** registro con contraseña segura (`scrypt` + _timing-safe compare_), **verificación por código de 6 dígitos** enviado vía SMTP real (`smtp.gmail.com` o SMTP configurado), cambio de correo verificado con confirmación, enlace privado de un solo uso para cambio de contraseña (`/change-password?token=...`), foto de perfil (`POST/DELETE /users/me/avatar`), etiqueta única automática (`#D5-XXXX`), _cookie_ `HttpOnly` + _Bearer_ y revocación en PostgreSQL.
- **Aspecto e idioma personalizables por usuario:** interfaz por defecto en **inglés** con cambio instantáneo a **español**, modo **oscuro o blanco**, y **6 colores de resaltado** (`orange`, `blue`, `green`, `red`, `pink`, `purple`) desde `/settings` o mediante clic derecho / pulsación larga fuera de las tarjetas.
- **Ligas privadas 100 % aisladas:** al crear una liga se instancian **30 equipos propios**, **540 jugadores propios**, calendario de **58 jornadas** (870 partidos) y economía independiente. Lo ocurrido en una liga **nunca** altera a otras ligas.
- **Reglas de liga v0.3 aplicadas en BD y API:**
  - Máximo **1 presidencia activa por usuario** (índice único parcial `leagues_one_active_presidency_per_user` en PostgreSQL y respuesta `409 Conflict`).
  - Límite de **30 participantes** por liga; los miembros se invitan mediante etiqueta `#D5-XXXX` y reciben un equipo CPU disponible al azar **heredando los Dream Points acumulados** hasta ese momento.
- **Gestión de quinteto titular (`PG`, `SG`, `SF`, `PF`, `C`):**
  - Solo los **5 titulares alineados** suman **Dream Points** (`DP`) en cada jornada.
  - Bloqueo previo automático según reloj de liga y configuración provisional (`PROVISIONAL_GAME_CONFIG.lineupRules.lockMinutesBeforeTipoff`).
- **Simulación 24/7 + consola exclusiva de administración (`/simulation`):**
  - _Worker_ autónomo en `apps/worker` con planificador horario de mercado y _tick_ continuo de jornadas vencidas + eventos en tiempo real vía Redis Pub/Sub → Socket.IO (`league:<leagueId>`).
  - Consola `/simulation` (en español, restringida estrictamente al administrador `ivan.k@dreamfive.local`) para simular 1 partido, simular 1 jornada, adelantar el reloj `+12h`/`+24h`, recalcular mercado y renovar temporada mensual.
- **Traspasos ACID con validación estricta:** ambos equipos conservan exactamente **18 jugadores**, cobertura de las **5 posiciones**, valoración ofrecida ≥ **50 %** del paquete solicitado, **bloqueo de 1 partido** para ambos jugadores (ofrecido y pedido) tras oferta rechazada, **bloqueo de 5 partidos** tras fichaje completado e idempotencia ante doble aceptación concurrente.

---

## Stack tecnológico

| Capa                       | Tecnología                                                                                                            |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Frontend**               | React 19, TanStack Start, TanStack Router, TanStack Query, Tailwind CSS v4, Socket.IO Client                          |
| **Backend API**            | NestJS 11/12 sobre Fastify, Socket.IO, Zod, Pino Logger, Nodemailer (SMTP real)                                       |
| **Workers 24/7**           | NestJS Standalone + BullMQ (`simulation`, `market`, `injuries`, `progression`, `rankings`, `seasons`)                 |
| **Base de datos**          | PostgreSQL 18 + Prisma 7 (`@prisma/adapter-pg`)                                                                       |
| **Caché / Colas / PubSub** | Redis 8 (AOF persistente)                                                                                             |
| **Motor deportivo**        | Paquete puro TypeScript (`@dreamfive/simulation-engine`) sin acoplamiento a NestJS ni Prisma                          |
| **Calidad y pruebas**      | TypeScript 6 estricto, ESLint (`--max-warnings=0`), Prettier, Vitest (unitarias e integración real), Playwright (E2E) |

---

## Arquitectura de producción (Raspberry Pi 5 + Cloudflare Tunnel)

En producción (`/opt/docker/apps/DreamFive`, Raspberry Pi 5 16 GB · Raspberry Pi OS Lite 64 bits `linux/arm64`), **`gateway` (Nginx)** es el único servicio con puerto publicado en el host (`127.0.0.1:3000 -> 80`), publicado a Internet mediante **Cloudflare Tunnel**:

```text
https://dreamfive.donivanovich.dev  ──(Cloudflare Tunnel)──►  127.0.0.1:3000 [gateway · Nginx]
                                                                 ├── /api/*         ──► api:3001/* (REST)
                                                                 ├── /socket.io/    ──► api:3001/socket.io/ (WebSocket)
                                                                 ├── /uploads/*     ──► api:3001/uploads/*
                                                                 ├── /gateway-health ──► 200 ok
                                                                 └── /*             ──► web:3000/* (TanStack Start SSR)
```

- **Puertos internos únicamente:** `web`, `api`, `worker`, `postgres`, `redis`, `migrate` y `seed` no publican puertos en el host; se comunican únicamente a través de las redes Docker `edge` y `backend` (`internal: true`).
- **Rutas relativas en frontend:** el frontend usa `VITE_API_URL=/api` y Socket.IO conecta al mismo origen (`/socket.io`), sin depender de un hostname ni puerto separado para la API.
- **Guía completa de operación** (instalación desde cero en Raspberry Pi 5, Cloudflare Tunnel, actualizaciones, migraciones, healthchecks, logs y backups/restauración): [docs/development/local-setup.md](./docs/development/local-setup.md) y [docs/architecture/overview.md](./docs/architecture/overview.md).

---

## Arranque completo con Docker Compose (local)

### 1. Requisitos previos

- Docker + Docker Compose v2
- _(Solo para desarrollo sin Docker o ejecutar tests en local)_ Node.js `>=24.12.0 <25` (`.nvmrc`: `24.22.3`) y pnpm `12.18.0`

### 2. Levantar todo el sistema en un único comando

```bash
cp .env.example .env
pnpm docker:up
# o directamente: docker compose up -d --build
```

Este comando construye y levanta automáticamente toda la arquitectura con el mismo gateway Nginx que en producción:

- `postgres` + `redis` (red interna `backend`, persistentes)
- `migrate` (aplica migraciones SQL de Prisma automáticamente al arrancar)
- `seed` (carga catálogo inicial idempotente, cuenta demo y _Liga Mediterránea_)
- `api` · `worker` · `web` (solo accesibles internamente por red Docker)
- `gateway` (Nginx, único puerto publicado en el host: `127.0.0.1:3000`)

Acceso local (configurable en `.env`):

- **Aplicación + API (`/api`) + Socket.IO (`/socket.io`):** `http://localhost:3000` (rango de respaldo `GATEWAY_PORT_RANGE=3000-3099`)
- **Healthcheck gateway / readiness API:** `http://localhost:3000/gateway-health` · `http://localhost:3000/api/health/ready`

> Si el puerto `3000` (o `POSTGRES_PORT` / `REDIS_PORT` en `pnpm docker:infra`) ya está ocupado en el host, `pnpm docker:up` selecciona automáticamente un puerto libre dentro de su rango (`*_PORT_RANGE`) y sincroniza `WEB_PUBLIC_URL`, `VITE_PUBLIC_URL` y `API_CORS_ORIGINS` manteniendo `VITE_API_URL=/api`. Puedes previsualizar el puerto asignado con `pnpm docker:ports`.

### 3. Cuenta de demostración (cargada por `seed`)

| Usuario         | Correo                    | Contraseña           | Etiqueta   | Rol en seed                    |
| --------------- | ------------------------- | -------------------- | ---------- | ------------------------------ |
| **María Soler** | `maria.s@dreamfive.local` | `DreamFiveDemo!2026` | `#D5-7310` | Miembro de _Liga Mediterránea_ |

> El acceso rápido de demostración únicamente ofrece una cuenta estándar de mánager sin acceso a la consola de simulación administrativa.

---

## Reglas provisionales configurables

Los parámetros de balanceo todavía abiertos están centralizados en `PROVISIONAL_GAME_CONFIG` (`packages/shared/src/constants/index.ts`) y visibles en UI (`/settings`):

- Ponderaciones de **Dream Points** (`pts`, `reb`, `ast`, `stl`, `blk`, `tov`, `pf`, `min`).
- Minutos de bloqueo antes del salto inicial (`5` min) y no sustitución automática.
- Probabilidades base de lesión/expulsión, frecuencia de progresión (`5` partidos) y sensibilidad de mercado (`0.06`).
- Presupuesto inicial (`25 M$`), premio por victoria (`1.000` créditos × Dream Points de la jornada) y bloqueos de traspasos (`1` partido tras rechazo para ambos jugadores, `5` partidos tras fichaje completado).

---

## CI/CD con GitHub Actions

El repositorio incluye un pipeline automatizado de integración continua (**CI**), entrega continua de contenedores (**CD**) y auditoría periódica de seguridad ubicado en `.github/`:

- **Acción reutilizable:** `.github/actions/setup-workspace/action.yml` — centraliza la instalación de `pnpm` (versión fijada por `packageManager`), Node.js (leído desde `.nvmrc`), caché del store de `pnpm` e instalación reproducible con `pnpm install --frozen-lockfile`.

### Workflows disponibles

| Workflow                   | Archivo                          | Disparadores                                                                        | Propósito principal                                                                                                                          |
| -------------------------- | -------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **CI**                     | `.github/workflows/ci.yml`       | `push` (`main`, `develop`), `pull_request` (`main`, `develop`), `workflow_dispatch` | Validación estática, build, pruebas unitarias, integración real (PostgreSQL 18 + Redis 8), Docker, auditoría y E2E Playwright.               |
| **CD**                     | `.github/workflows/cd.yml`       | `workflow_run` (solo tras `CI` en verde sobre `main`), `workflow_dispatch`          | Publicación nativa `linux/arm64` en GitHub Container Registry (**GHCR**) y despliegue automático por SSH en **Raspberry Pi 5** con rollback. |
| **Security & Maintenance** | `.github/workflows/security.yml` | `schedule` (lunes `06:00 UTC`), `workflow_dispatch`                                 | Auditoría semanal de dependencias, esquema Prisma y sintaxis Docker Compose (base, desarrollo y producción).                                 |

### Validaciones realizadas en CI (`ci.yml`)

El workflow cancela automáticamente ejecuciones obsoletas únicamente en Pull Requests (`cancel-in-progress: ${{ github.event_name == 'pull_request' }}`) y opera con permisos mínimos (`contents: read`):

1. **`static-and-unit`:** `pnpm run db:validate`, `pnpm run build:packages`, `pnpm run format:check` (Prettier), `pnpm exec eslint . --max-warnings=0`, `pnpm -r --sort run typecheck`, `pnpm run build` y pruebas unitarias (`@dreamfive/shared`, `@dreamfive/simulation-engine`, `@dreamfive/web`, `@dreamfive/worker` e `infrastructure/scripts/*.test.mjs`).
2. **`integration` (en paralelo):** levanta servicios `postgres:18.6-alpine3.24` y `redis:8.8.4-alpine3.23`, aplica `pnpm run db:migrate:deploy` y ejecuta las pruebas de integración de `@dreamfive/database` y `@dreamfive/api`.
3. **`docker-and-security` (en paralelo):** ejecuta `pnpm audit --prod --audit-level=high`, valida `docker-compose.yml`, `docker-compose.dev.yml` y `docker-compose.prod.yml` con `docker compose config --quiet` y comprueba la compilación de los 5 _targets_ de `infrastructure/docker/node.Dockerfile` (`api`, `worker`, `web`, `migrate`, `seed`) sin publicar (`push: false`).
4. **`e2e` (`needs: [static-and-unit, integration]`):** prepara la base de datos E2E (`db:migrate:deploy` + `db:seed`), levanta la API y verifica `/health/ready`, restaura la caché de Chromium para Playwright, ejecuta `pnpm run test:e2e` y adjunta `apps/web/playwright-report/` + `api-e2e.log` como artefacto (7 días) si falla.

### Entrega y despliegue continuo en Raspberry Pi 5 (`cd.yml`)

El workflow `CD` se ejecuta **únicamente** cuando `CI` ha finalizado con éxito sobre la rama `main` (`workflow_run`, filtrando `conclusion == 'success'`, `head_branch == 'main'` y excluyendo Pull Requests) o mediante `workflow_dispatch`:

1. **`publish-images` (`ubuntu-24.04-arm`, `packages: write`):** descarga el commit exacto verificado por CI (`head_sha`), valida `docker-compose.prod.yml` y construye de forma **nativa para `linux/arm64`** (sin emulación QEMU) los 5 _targets_ (`api`, `worker`, `web`, `migrate`, `seed`) con `VITE_API_URL=/api` y `VITE_PUBLIC_URL=https://dreamfive.donivanovich.dev` por defecto, publicándolos en **GHCR** (`ghcr.io/<owner>/dreamfive-<servicio>`) con etiqueta inmutable `sha-<7-chars>`, `main` y `latest`.
2. **`deploy-raspberry-pi` (`needs: publish-images`, entorno `production`):** solo se ejecuta si `vars.DEPLOY_ENABLED == 'true'`.
   - Transfiere atómicamente `docker-compose.prod.yml` e `infrastructure/nginx/default.conf` del commit verificado a `${DEPLOY_PATH}` (`/opt/docker/apps/DreamFive`), sin modificar nunca tu `.env` ni tus volúmenes persistentes.
   - Autentica la Pi en GHCR mediante `--password-stdin` y descarga las imágenes nuevas (`docker compose -f docker-compose.prod.yml pull`) antes de tocar ningún contenedor activo.
   - Asegura `postgres` y `redis` activos con `--no-recreate` (nunca los detiene ni reinicia innecesariamente).
   - Ejecuta `docker compose -f docker-compose.prod.yml --profile ops run --rm migrate` antes de sustituir `api`, `worker`, `web` y `gateway` (`up -d --no-deps --remove-orphans`).
   - Comprueba el estado `running` + `healthy` de **`gateway`, `api`, `worker` y `web`** mediante `docker inspect`, además de probar `/gateway-health`, `/api/health/ready` y `/` a través de `127.0.0.1:3000`.
   - **Rollback automático:** si fallan las migraciones o la verificación de salud, restaura los respaldos `.bak` de Compose y Nginx, revierte `api`, `worker`, `web` y `gateway` a la última etiqueta verificada (`.deploy_current_tag`), comprueba que el rollback vuelva a estar `healthy` y marca el job como fallido.

> **Preparación inicial única en la Raspberry Pi 5 (`/opt/docker/apps/DreamFive`):** crea el directorio, coloca allí tu `.env` de producción (ver [docs/development/local-setup.md](./docs/development/local-setup.md)) y configura Cloudflare Tunnel apuntando `dreamfive.donivanovich.dev` → `http://localhost:3000`. El `seed` solo se ejecuta manualmente bajo autorización expresa en una base de datos nueva.

### Secretos y variables de repositorio / entorno (`production`)

| Tipo     | Nombre                               | Obligatorio para                 | Descripción                                                                                                      |
| -------- | ------------------------------------ | -------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Variable | `VITE_API_URL`                       | `publish-images` (opcional)      | Ruta de la API incrustada en el build de `web` (por defecto `/api`, ruta relativa tras el gateway Nginx).        |
| Variable | `VITE_PUBLIC_URL`                    | `publish-images` (opcional)      | URL pública para metadatos Open Graph / canonical (por defecto `https://dreamfive.donivanovich.dev`).            |
| Variable | `DEPLOY_ENABLED`                     | `deploy-raspberry-pi`            | Establecer en `true` para activar el despliegue SSH automático en la Raspberry Pi 5 tras publicar.               |
| Variable | `DEPLOY_PORT`                        | `deploy-raspberry-pi` (opcional) | Puerto SSH de la Raspberry Pi 5 (por defecto `22`).                                                              |
| Variable | `DEPLOY_GATEWAY_HEALTH_URL`          | `deploy-raspberry-pi` (opcional) | URL local del healthcheck del gateway (por defecto `http://127.0.0.1:3000/gateway-health`).                      |
| Variable | `DEPLOY_API_HEALTH_URL`              | `deploy-raspberry-pi` (opcional) | URL local para comprobar readiness de la API vía gateway (por defecto `http://127.0.0.1:3000/api/health/ready`). |
| Variable | `DEPLOY_WEB_HEALTH_URL`              | `deploy-raspberry-pi` (opcional) | URL local para comprobar el frontend vía gateway (por defecto `http://127.0.0.1:3000/`).                         |
| Secret   | `DEPLOY_HOST`                        | `deploy-raspberry-pi`            | IP pública/Tailscale o dominio de la Raspberry Pi 5.                                                             |
| Secret   | `DEPLOY_USER`                        | `deploy-raspberry-pi`            | Usuario SSH dedicado en la Pi con permisos mínimos (`docker`).                                                   |
| Secret   | `DEPLOY_PATH`                        | `deploy-raspberry-pi`            | Ruta absoluta en la Pi (`/opt/docker/apps/DreamFive`).                                                           |
| Secret   | `DEPLOY_SSH_KEY`                     | `deploy-raspberry-pi`            | Clave privada SSH exclusiva para despliegue (sin usar claves personales).                                        |
| Secret   | `DEPLOY_SSH_KNOWN_HOSTS`             | `deploy-raspberry-pi`            | Salida de `ssh-keyscan -p <puerto> <host>` para validar la huella del host (`StrictHostKeyChecking`).            |
| Secret   | `GHCR_PULL_USER` / `GHCR_PULL_TOKEN` | `deploy-raspberry-pi` (opcional) | Credenciales `read:packages` si prefieres un token dedicado en lugar de `GITHUB_TOKEN`.                          |

### Cómo consultar resultados y actuar ante un fallo

1. **Consultar resultados:** abre la pestaña **Actions** del repositorio en GitHub, selecciona el workflow (`CI`, `CD` o `Security & Maintenance`) y entra en el job concreto para inspeccionar logs paso a paso.
2. **Si falla `static-and-unit`:** reproduce localmente con `pnpm run format:check`, `pnpm run lint`, `pnpm run typecheck` y `pnpm run build`.
3. **Si falla `integration`:** levanta PostgreSQL y Redis locales (`pnpm docker:infra`), aplica `pnpm run db:migrate:deploy` y ejecuta `pnpm --filter @dreamfive/database run test` o `pnpm --filter @dreamfive/api run test`.
4. **Si falla `e2e`:** descarga el artefacto `playwright-report` adjunto en la ejecución de GitHub Actions (incluye el informe HTML de Playwright y `api-e2e.log`) para revisar trazas y capturas.
5. **Si falla `docker-and-security`:** ejecuta `pnpm audit --prod --audit-level=high` y `docker compose config --quiet` en local; nunca desactives auditorías ni controles de seguridad para forzar un verde.
6. **Si falla `deploy-raspberry-pi`:** revisa en el log los últimos eventos y si se completó el rollback automático hacia `.deploy_current_tag`, y comprueba en la Pi `docker compose -f docker-compose.prod.yml ps` y `docker compose -f docker-compose.prod.yml logs --tail=100 api worker web`.

---

## Documentación completa (`docs/`)

- [Índice documental](./docs/README.md)
- **Arquitectura:** [Visión general](./docs/architecture/overview.md) · [Decisiones técnicas](./docs/architecture/decisions.md) · [Aislamiento entre ligas](./docs/architecture/data-isolation.md)
- **Base de datos:** [Esquema Prisma y restricciones](./docs/database/schema.md)
- **Mecánicas del juego:** [Reglas y configuración provisional](./docs/gameplay/rules.md) · [Motor y simulación 24/7](./docs/gameplay/simulation.md) · [Economía y mercado](./docs/gameplay/economy.md) · [Traspasos ACID](./docs/gameplay/transfers.md)
- **API REST y Tiempo Real:** [Referencia de endpoints y WebSockets](./docs/api/endpoints.md)
- **Desarrollo:** [Instalación y operación local](./docs/development/local-setup.md) · [Estrategia de pruebas](./docs/development/testing.md) · [Resolución de problemas](./docs/development/troubleshooting.md)
