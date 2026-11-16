# DREAM5

**DREAM5** es un juego _fantasy_ de gestión deportiva de baloncesto Full Stack preparado para operar **24/7**, con ligas privadas completamente aisladas entre sí, simulación automática de partidos, economía dinámica, lesiones, expulsiones, progresión de jugadores, traspasos con garantías ACID y competición mensual por temporadas.

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
  - Consola `/simulation` (en español, restringida estrictamente al administrador `ivan.k@dream5.local`) para simular 1 partido, simular 1 jornada, adelantar el reloj `+12h`/`+24h`, recalcular mercado y renovar temporada mensual.
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
| **Motor deportivo**        | Paquete puro TypeScript (`@dream5/simulation-engine`) sin acoplamiento a NestJS ni Prisma                             |
| **Calidad y pruebas**      | TypeScript 6 estricto, ESLint (`--max-warnings=0`), Prettier, Vitest (unitarias e integración real), Playwright (E2E) |

---

## Arranque completo con Docker Compose (recomendado)

### 1. Requisitos previos

- Docker + Docker Compose
- _(Solo para desarrollo sin Docker o ejecutar tests en local)_ Node.js `>=24.12.0 <25` (`.nvmrc`: `24.22.3`) y pnpm `12.18.0`

### 2. Levantar todo el sistema en un único comando

```bash
cp .env.example .env
docker compose up -d --build
```

Este comando construye y levanta automáticamente toda la arquitectura sin necesidad de abrir terminales manuales para API, Worker ni Web:

- `postgres` + `redis`
- `migrate` (aplica migraciones SQL de Prisma automáticamente al arrancar)
- `seed` (carga catálogo inicial idempotente, usuarios demo y _Liga Mediterránea_)
- `api` · `worker` · `web`

Accesos locales (configurables en `.env`):

- **Frontend web:** `http://localhost:3100`
- **API Fastify:** `http://localhost:3101`

> Por defecto `.env` utiliza `WEB_PORT=3100` y `API_PORT=3101` para evitar colisiones con contenedores en `3000`/`3001`.

### 3. Credenciales de demostración (cargadas por `seed`)

| Usuario          | Correo                 | Contraseña         | Etiqueta   | Rol en seed                                     |
| ---------------- | ---------------------- | ------------------ | ---------- | ----------------------------------------------- |
| **Iván Kovac**   | `ivan.k@dream5.local`  | `Dream5Demo!2026`  | `#D5-4821` | Administrador de simulación y Pte. Mediterránea |
| **María Soler**  | `maria.s@dream5.local` | `Dream5Demo!2026`  | `#D5-7310` | Miembro de _Liga Mediterránea_                  |
| **Admin DREAM5** | `admin@dream5.local`   | `Dream5Admin!2026` | `#D5-0001` | Mánager sin liga activa                         |

---

## Reglas provisionales configurables

Los parámetros de balanceo todavía abiertos están centralizados en `PROVISIONAL_GAME_CONFIG` (`packages/shared/src/constants/index.ts`) y visibles en UI (`/settings`):

- Ponderaciones de **Dream Points** (`pts`, `reb`, `ast`, `stl`, `blk`, `tov`, `pf`, `min`).
- Minutos de bloqueo antes del salto inicial (`5` min) y no sustitución automática.
- Probabilidades base de lesión/expulsión, frecuencia de progresión (`5` partidos) y sensibilidad de mercado (`0.06`).
- Presupuesto inicial (`25 M$`), premio por victoria (`1.000` créditos × Dream Points de la jornada) y bloqueos de traspasos (`1` partido tras rechazo para ambos jugadores, `5` partidos tras fichaje completado).

---

## Documentación completa (`docs/`)

- [Índice documental](./docs/README.md)
- **Arquitectura:** [Visión general](./docs/architecture/overview.md) · [Decisiones técnicas](./docs/architecture/decisions.md) · [Aislamiento entre ligas](./docs/architecture/data-isolation.md)
- **Base de datos:** [Esquema Prisma y restricciones](./docs/database/schema.md)
- **Mecánicas del juego:** [Reglas y configuración provisional](./docs/gameplay/rules.md) · [Motor y simulación 24/7](./docs/gameplay/simulation.md) · [Economía y mercado](./docs/gameplay/economy.md) · [Traspasos ACID](./docs/gameplay/transfers.md)
- **API REST y Tiempo Real:** [Referencia de endpoints y WebSockets](./docs/api/endpoints.md)
- **Desarrollo:** [Instalación y operación local](./docs/development/local-setup.md) · [Estrategia de pruebas](./docs/development/testing.md) · [Resolución de problemas](./docs/development/troubleshooting.md)
