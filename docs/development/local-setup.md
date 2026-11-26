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

- `WEB_PORT=3100` y `WEB_PORT_RANGE=3100-3199` (rango de respaldo si `3100` ya está en uso)
- `API_PORT=3101` y `API_PORT_RANGE=3101-3199` (rango de respaldo si `3101` ya está en uso)
- `POSTGRES_PORT_RANGE=5432-5499` y `REDIS_PORT_RANGE=6379-6449` (para `docker-compose.dev.yml`)
- `VITE_API_URL=http://localhost:3101`
- `WEB_PUBLIC_URL=http://localhost:3100` (también usada para los metadatos Open Graph / Twitter Cards al compartir la URL)
- `API_CORS_ORIGINS=http://localhost:3100`
- `SMTP_HOST=smtp.gmail.com` y `SMTP_PORT=465` (`SMTP_SECURE=true`) junto con `SMTP_USER` y `SMTP_PASS` para correo real.

## 3. Arranque total con un solo comando

```bash
pnpm docker:up
# o directamente: docker compose up -d --build
```

Si alguno de los puertos configurados está ocupado, `pnpm docker:up` busca automáticamente el primer puerto libre dentro de su rango (`*_PORT_RANGE`) y sincroniza `VITE_API_URL`, `WEB_PUBLIC_URL` y `API_CORS_ORIGINS`. Puedes comprobar qué puertos se asignarían sin levantar contenedores con `pnpm docker:ports`.

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
