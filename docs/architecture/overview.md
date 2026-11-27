# Arquitectura general de DreamFive

DreamFive sigue una arquitectura de **monolito modular Full Stack** contenedorizada con Docker Compose, con un **gateway Nginx como único punto de entrada**, procesamiento asíncrono desacoplado en **workers 24/7** y un **motor de simulación deportivo independiente** en TypeScript puro.

## Topología de producción (Raspberry Pi 5 + Cloudflare Tunnel)

En producción (`/opt/docker/apps/DreamFive`, Raspberry Pi 5 16 GB · Raspberry Pi OS Lite 64 bits `linux/arm64`), el único puerto publicado en el host es **`127.0.0.1:3000`** del servicio `gateway`:

```text
  [Internet / Navegadores]
            │ HTTPS (TLS)
            ▼
  [Cloudflare Tunnel]
  dreamfive.donivanovich.dev ──► http://localhost:3000
            │
            ▼  (único puerto en el host: 127.0.0.1:3000 -> 80)
  ┌──────────────────────────────────────────────────────────┐
  │  gateway (Nginx 1.28 Alpine) · red `edge`                │
  │   • /gateway-health ──► 200 ok (liveness)                │
  │   • /socket.io/     ──► api:3001/socket.io/ (WebSocket)  │
  │   • /api/socket.io/ ──► api:3001/socket.io/ (WebSocket)  │
  │   • /api/*          ──► api:3001/*          (REST JSON)  │
  │   • /uploads/*      ──► api:3001/uploads/*  (avatares)   │
  │   • /*              ──► web:3000/*          (SSR + SPA)  │
  └──────────────┬───────────────────────────┬───────────────┘
                 │ red `edge` (interna)      │ red `edge` (interna)
                 ▼                           ▼
      [web — TanStack Start]      [api — NestJS + Fastify + Socket.IO]
      (puerto interno 3000)          │          │             ▲
                                     │ Prisma   │ BullMQ      │ Redis Pub/Sub
      ─── red `backend` (internal) ──┼──────────┼─────────────┼───
                                     ▼          ▼             │
                             [postgres:18]  [redis:8 AOF]     │
                                  ▲              ▲            │
                                  │ Prisma       │ BullMQ     │
                                  └── [worker (Standalone)] ──┘
                                                 │
                                  [migrate / seed (one-shot)]
```

### Principios de red y aislamiento

- **Un único origen público (`https://dreamfive.donivanovich.dev`):** el frontend utiliza `VITE_API_URL=/api` (ruta relativa) y Socket.IO conecta al mismo origen sobre `/socket.io`, eliminando CORS entre subdominios y evitando puertos públicos adicionales.
- **Sin exposición directa de servicios internos:** `web`, `api`, `worker`, `postgres`, `redis`, `migrate` y `seed` no publican puertos en el host.
- **Doble red Docker:**
  - `edge`: comunica únicamente `gateway`, `web` y `api`.
  - `backend` (`internal: true`): aísla `postgres`, `redis`, `api`, `worker`, `migrate` y `seed` sin salida a Internet.

## Responsabilidad de cada contenedor

| Servicio   | Imagen / Build                   | Redes             | Puertos host     | Responsabilidad                                                                                         |
| ---------- | -------------------------------- | ----------------- | ---------------- | ------------------------------------------------------------------------------------------------------- |
| `gateway`  | `nginx:1.28.3-alpine`            | `edge`            | `127.0.0.1:3000` | Punto de entrada único, proxy inverso HTTP/SSR/API y actualización WebSocket para Socket.IO.            |
| `web`      | `dreamfive-web` (`node:24`)      | `edge`            | Ninguno          | Aplicación web SSR + SPA (React 19, TanStack Start, TanStack Query) y metadatos Open Graph.             |
| `api`      | `dreamfive-api` (`node:24`)      | `edge`, `backend` | Ninguno          | API REST (NestJS + Fastify), autenticación por cookie `HttpOnly`/Bearer, Socket.IO, SMTP y avatares.    |
| `worker`   | `dreamfive-worker` (`node:24`)   | `backend`         | Ninguno          | Planificador 24/7 (`LeagueCronScheduler`) y 6 colas BullMQ (`simulation`, `market`, etc.).              |
| `postgres` | `postgres:18.6-alpine3.24`       | `backend`         | Ninguno          | Base de datos relacional persistente (`postgres-data`) con aislamiento estricto por liga.               |
| `redis`    | `redis:8.8.4-alpine3.23`         | `backend`         | Ninguno          | Colas BullMQ (`noeviction`, AOF en `redis-data`) y canal Pub/Sub para eventos en tiempo real.           |
| `migrate`  | `dreamfive-migrate` (`one-shot`) | `backend`         | Ninguno          | Ejecuta `prisma migrate deploy` de forma idempotente antes de actualizar la aplicación.                 |
| `seed`     | `dreamfive-seed` (`one-shot`)    | `backend`         | Ninguno          | Carga inicial idempotente de 30 equipos, 540 jugadores y liga demo (manual bajo perfil `seed` en prod). |

## Responsabilidad de cada paquete del monorepo

- **`packages/shared` (`@dreamfive/shared`):** enumeraciones, esquemas Zod compartidos, DTOs, constantes de colas (`QUEUE_NAMES`, `JOB_NAMES`), eventos Socket.IO (`SOCKET_EVENTS`) y `PROVISIONAL_GAME_CONFIG`.
- **`packages/simulation-engine` (`@dreamfive/simulation-engine`):** lógica deportiva pura y determinista sin dependencias de NestJS, React ni Prisma (catálogo de 30 equipos / 540 jugadores, calendario de 58 jornadas, simulación de partidos, Dream Points, lesiones, progresión y mercado).
- **`packages/database` (`@dreamfive/database`):** esquema Prisma 7 (`prisma/schema.prisma`), migraciones SQL, `@prisma/adapter-pg`, hashing `scrypt` y servicios transaccionales compartidos entre API y Worker.
- **`apps/api` (`@dreamfive/api`):** servidor HTTP Fastify + `RealtimeGateway` Socket.IO autenticado + módulos de dominio, SMTP real y subida de avatares en volumen `api-uploads`.
- **`apps/worker` (`@dreamfive/worker`):** proceso autónomo 24/7 con _heartbeat_ (`/tmp/worker.heartbeat`) y colas BullMQ.
- **`apps/web` (`@dreamfive/web`):** interfaz bilingüe (inglés/español), temas claro/oscuro, 6 acentos, rutas relativas `/api` y sincronización en vivo vía `useLeagueRealtime`.
