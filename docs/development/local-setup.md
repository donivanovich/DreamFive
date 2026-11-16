# Puesta en marcha con Docker Compose

Guía verificada para levantar todo el sistema **DREAM5** (PostgreSQL 18, Redis 8, migraciones automáticas, seed, API Fastify, Worker 24/7 y aplicación Web) mediante un único comando Docker Compose.

## 1. Requisitos previos

- **Docker + Docker Compose**
- _(Opcional para correr checks/tests en el host)_ Node.js `>=24.12.0 <25` (`.nvmrc`: `24.22.3`) y pnpm `12.18.0`.

## 2. Variables de entorno (`.env`)

Copia el archivo plantilla si aún no existe:

```bash
cp .env.example .env
```

Valores clave en `.env`:

- `WEB_PORT=3100` y `API_PORT=3101`
- `VITE_API_URL=http://localhost:3101`
- `WEB_PUBLIC_URL=http://localhost:3100`
- `API_CORS_ORIGINS=http://localhost:3100`
- `SMTP_HOST=smtp.gmail.com` y `SMTP_PORT=465` (`SMTP_SECURE=true`) junto con `SMTP_USER` y `SMTP_PASS` para correo real.

## 3. Arranque total con un solo comando

```bash
docker compose up -d --build
```

Secuencia automática orquestada por Compose:

1. Arrancan `postgres` y `redis` con sus _healthchecks_.
2. Se ejecuta el servicio `migrate` (`prisma migrate deploy`).
3. Se ejecuta el servicio `seed` (idempotente: carga 30 equipos, 540 jugadores, cuentas demo y _Liga Mediterránea_).
4. Arrancan en paralelo `api`, `worker` 24/7 y `web`.

Comandos útiles de mantenimiento:

```bash
docker compose ps
docker compose logs -f api worker web
docker compose down
```
