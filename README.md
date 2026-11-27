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

## Arranque completo con Docker Compose (recomendado)

### 1. Requisitos previos

- Docker + Docker Compose
- _(Solo para desarrollo sin Docker o ejecutar tests en local)_ Node.js `>=24.12.0 <25` (`.nvmrc`: `24.22.3`) y pnpm `12.18.0`

### 2. Levantar todo el sistema en un único comando

```bash
cp .env.example .env
pnpm docker:up
# o directamente: docker compose up -d --build
```

Este comando construye y levanta automáticamente toda la arquitectura sin necesidad de abrir terminales manuales para API, Worker ni Web:

- `postgres` + `redis`
- `migrate` (aplica migraciones SQL de Prisma automáticamente al arrancar)
- `seed` (carga catálogo inicial idempotente, usuarios demo y _Liga Mediterránea_)
- `api` · `worker` · `web`

Accesos locales (configurables en `.env`):

- **Frontend web:** `http://localhost:3100` (rango de respaldo `WEB_PORT_RANGE=3100-3199`)
- **API Fastify:** `http://localhost:3101` (rango de respaldo `API_PORT_RANGE=3101-3199`)

> Si los puertos definidos (`WEB_PORT`, `API_PORT`, `POSTGRES_PORT` o `REDIS_PORT`) ya están ocupados en el host, Docker Compose y `pnpm docker:up` seleccionan automáticamente un puerto libre dentro de su rango (`*_PORT_RANGE`) y sincronizan `VITE_API_URL`, `WEB_PUBLIC_URL` y `API_CORS_ORIGINS`. Puedes previsualizar los puertos asignados con `pnpm docker:ports`.

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

| Workflow                   | Archivo                          | Disparadores                                                                        | Propósito principal                                                                                                            |
| -------------------------- | -------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **CI**                     | `.github/workflows/ci.yml`       | `push` (`main`, `develop`), `pull_request` (`main`, `develop`), `workflow_dispatch` | Validación estática, build, pruebas unitarias, integración real (PostgreSQL 18 + Redis 8), Docker, auditoría y E2E Playwright. |
| **CD**                     | `.github/workflows/cd.yml`       | `push` (`main` y etiquetas `v*.*.*`), `workflow_dispatch`                           | Publicación de imágenes Docker en GitHub Container Registry (**GHCR**) y despliegue SSH opcional con rollback automático.      |
| **Security & Maintenance** | `.github/workflows/security.yml` | `schedule` (lunes `06:00 UTC`), `workflow_dispatch`                                 | Auditoría semanal de dependencias, esquema Prisma y sintaxis Docker Compose.                                                   |

### Validaciones realizadas en CI (`ci.yml`)

El workflow cancela automáticamente ejecuciones obsoletas únicamente en Pull Requests (`cancel-in-progress: ${{ github.event_name == 'pull_request' }}`) y opera con permisos mínimos (`contents: read`):

1. **`static-and-unit`:** `pnpm run db:validate`, `pnpm run build:packages`, `pnpm run format:check` (Prettier), `pnpm exec eslint . --max-warnings=0`, `pnpm -r --sort run typecheck`, `pnpm run build` y pruebas unitarias (`@dreamfive/shared`, `@dreamfive/simulation-engine`, `@dreamfive/web`, `@dreamfive/worker` e `infrastructure/scripts/*.test.mjs`).
2. **`integration` (en paralelo):** levanta servicios `postgres:18.6-alpine3.24` y `redis:8.8.4-alpine3.23`, aplica `pnpm run db:migrate:deploy` y ejecuta las pruebas de integración de `@dreamfive/database` y `@dreamfive/api`.
3. **`docker-and-security` (en paralelo):** ejecuta `pnpm audit --prod --audit-level=high`, valida `docker-compose.yml` y `docker-compose.dev.yml` con `docker compose config --quiet` y comprueba la compilación de los 5 _targets_ de `infrastructure/docker/node.Dockerfile` (`api`, `worker`, `web`, `migrate`, `seed`) sin publicar (`push: false`).
4. **`e2e` (`needs: [static-and-unit, integration]`):** prepara la base de datos E2E (`db:migrate:deploy` + `db:seed`), levanta la API y verifica `/health/ready`, restaura la caché de Chromium para Playwright, ejecuta `pnpm run test:e2e` y adjunta `apps/web/playwright-report/` + `api-e2e.log` como artefacto (7 días) si falla.

### Entrega y despliegue continuo (`cd.yml`)

1. **`pre-release-check`:** verifica `pnpm audit --prod --audit-level=high` y `docker compose config --quiet`.
2. **`publish-images` (`packages: write`):** construye y publica en **GHCR** las 5 imágenes (`ghcr.io/<owner>/dreamfive-{api,worker,web,migrate,seed}`) etiquetadas con `sha-<7-chars>`, nombre de rama (`main`), versión semántica (`vX.Y.Z` / `X.Y`) y `latest` solo como alias adicional en la rama por defecto.
3. **`deploy-ssh` (opcional, entorno `production`):** solo se ejecuta si `vars.DEPLOY_ENABLED == 'true'`. Se conecta al VPS/servidor por SSH con `StrictHostKeyChecking=yes`, inicia sesión en GHCR mediante `--password-stdin`, descarga las imágenes del commit (`sha-<short>`), aplica migraciones (`docker compose run --rm migrate`), actualiza `api`, `worker` y `web` sin detener `postgres` ni `redis`, y comprueba los _healthchecks_. Si la verificación de salud falla, ejecuta **rollback automático** hacia la etiqueta registrada en `.deploy_current_tag`.

> Para usar las imágenes de GHCR en un servidor propio, coloca en `DEPLOY_PATH` un `docker-compose.override.yml` que referencie `ghcr.io/<owner>/dreamfive-<servicio>:${IMAGE_TAG}` junto a tu `.env` de producción.

### Secretos y variables de repositorio / entorno (`production`)

| Tipo     | Nombre                               | Obligatorio para            | Descripción                                                                                        |
| -------- | ------------------------------------ | --------------------------- | -------------------------------------------------------------------------------------------------- |
| Variable | `VITE_API_URL`                       | `publish-images` (opcional) | URL pública de la API incrustada en el build de `web` (por defecto `http://localhost:3101`).       |
| Variable | `VITE_PUBLIC_URL`                    | `publish-images` (opcional) | URL pública de la web para metadatos Open Graph / canonical (por defecto `http://localhost:3100`). |
| Variable | `DEPLOY_ENABLED`                     | `deploy-ssh`                | Establecer en `true` para activar el despliegue SSH automático tras publicar en GHCR.              |
| Variable | `DEPLOY_PORT`                        | `deploy-ssh` (opcional)     | Puerto SSH del servidor (por defecto `22`).                                                        |
| Variable | `DEPLOY_API_HEALTH_URL`              | `deploy-ssh` (opcional)     | URL local del servidor para comprobar la API (por defecto `http://127.0.0.1:3101/health/ready`).   |
| Variable | `DEPLOY_WEB_HEALTH_URL`              | `deploy-ssh` (opcional)     | URL local del servidor para comprobar la web (por defecto `http://127.0.0.1:3100/`).               |
| Secret   | `DEPLOY_HOST`                        | `deploy-ssh`                | IP o dominio del servidor remoto.                                                                  |
| Secret   | `DEPLOY_USER`                        | `deploy-ssh`                | Usuario SSH con permisos mínimos de despliegue (`docker`).                                         |
| Secret   | `DEPLOY_PATH`                        | `deploy-ssh`                | Ruta absoluta en el servidor donde residen `docker-compose.yml` y `.env`.                          |
| Secret   | `DEPLOY_SSH_KEY`                     | `deploy-ssh`                | Clave privada SSH dedicada exclusivamente al despliegue.                                           |
| Secret   | `DEPLOY_SSH_KNOWN_HOSTS`             | `deploy-ssh`                | Salida de `ssh-keyscan -p <puerto> <host>` para validar la huella del servidor.                    |
| Secret   | `GHCR_PULL_USER` / `GHCR_PULL_TOKEN` | `deploy-ssh` (opcional)     | Credenciales de solo lectura (`read:packages`) si los paquetes GHCR son privados.                  |

### Cómo consultar resultados y actuar ante un fallo

1. **Consultar resultados:** abre la pestaña **Actions** del repositorio en GitHub, selecciona el workflow (`CI`, `CD` o `Security & Maintenance`) y entra en el job concreto para inspeccionar logs paso a paso.
2. **Si falla `static-and-unit`:** reproduce localmente con `pnpm run format:check`, `pnpm run lint`, `pnpm run typecheck` y `pnpm run build`.
3. **Si falla `integration`:** levanta PostgreSQL y Redis locales (`pnpm docker:infra`), aplica `pnpm run db:migrate:deploy` y ejecuta `pnpm --filter @dreamfive/database run test` o `pnpm --filter @dreamfive/api run test`.
4. **Si falla `e2e`:** descarga el artefacto `playwright-report` adjunto en la ejecución de GitHub Actions (incluye el informe HTML de Playwright y `api-e2e.log`) para revisar trazas y capturas.
5. **Si falla `docker-and-security`:** ejecuta `pnpm audit --prod --audit-level=high` y `docker compose config --quiet` en local; nunca desactives auditorías ni controles de seguridad para forzar un verde.
6. **Si falla `deploy-ssh`:** revisa en el log si se completó el rollback automático hacia `.deploy_current_tag` y comprueba en el servidor `docker compose ps` y `docker compose logs --tail=100 api worker web`.

---

## Documentación completa (`docs/`)

- [Índice documental](./docs/README.md)
- **Arquitectura:** [Visión general](./docs/architecture/overview.md) · [Decisiones técnicas](./docs/architecture/decisions.md) · [Aislamiento entre ligas](./docs/architecture/data-isolation.md)
- **Base de datos:** [Esquema Prisma y restricciones](./docs/database/schema.md)
- **Mecánicas del juego:** [Reglas y configuración provisional](./docs/gameplay/rules.md) · [Motor y simulación 24/7](./docs/gameplay/simulation.md) · [Economía y mercado](./docs/gameplay/economy.md) · [Traspasos ACID](./docs/gameplay/transfers.md)
- **API REST y Tiempo Real:** [Referencia de endpoints y WebSockets](./docs/api/endpoints.md)
- **Desarrollo:** [Instalación y operación local](./docs/development/local-setup.md) · [Estrategia de pruebas](./docs/development/testing.md) · [Resolución de problemas](./docs/development/troubleshooting.md)
