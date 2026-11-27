# Operación, despliegue en Raspberry Pi 5 y entorno local

Guía verificada para instalar desde cero, operar en producción sobre **Raspberry Pi 5** (`/opt/docker/apps/DreamFive`) y trabajar en desarrollo local con **DreamFive**.

---

## 1. Arquitectura de acceso y Cloudflare Tunnel

En producción y en Docker Compose local, **`gateway` (Nginx)** es el único contenedor con un puerto publicado en el host (`127.0.0.1:3000 -> 80`). Ni `web`, ni `api`, ni `postgres`, ni `redis` exponen puertos al host.

- **Dominio público:** `https://dreamfive.donivanovich.dev`
- **Túnel Cloudflare (`cloudflared`):**
  ```yaml
  ingress:
    - hostname: dreamfive.donivanovich.dev
      service: http://localhost:3000
    - service: http_status:404
  ```
- **Enrutamiento del gateway ([infrastructure/nginx/default.conf](../../infrastructure/nginx/default.conf)):**
  - `/gateway-health` → `200 ok` (comprobación del propio gateway)
  - `/socket.io/` y `/api/socket.io/` → `http://api:3001/socket.io/` (HTTP/1.1 + `Upgrade: websocket` + `proxy_buffering off` + `3600s` timeout)
  - `/api/*` → `http://api:3001/*` (API REST Fastify)
  - `/uploads/*` → `http://api:3001/uploads/*` (avatares servidos por la API)
  - `/*` → `http://web:3000/*` (TanStack Start SSR y estáticos)

---

## 2. Instalación desde cero en Raspberry Pi 5 (producción)

**Hardware/SO de referencia:** Raspberry Pi 5 (16 GB) · Raspberry Pi OS Lite 64 bits (`linux/arm64`) · Docker + Docker Compose v2.

**Ruta de producción:** `/opt/docker/apps/DreamFive`

### Paso 1 — Preparar directorio y ficheros

```bash
sudo mkdir -p /opt/docker/apps/DreamFive/infrastructure/nginx
sudo chown -R "$USER:$USER" /opt/docker/apps/DreamFive
cd /opt/docker/apps/DreamFive
```

Copia `docker-compose.prod.yml` e `infrastructure/nginx/default.conf` desde el repositorio (o clona el repo) y crea tu `.env` a partir de `.env.example`.

### Paso 2 — Variables de entorno en `/opt/docker/apps/DreamFive/.env`

Ajusta los valores de producción (generando contraseñas robustas de ≥ 24 caracteres):

```env
NODE_ENV=production
LOG_LEVEL=info
TZ=Europe/Madrid

GATEWAY_PORT=3000
GHCR_IMAGE_PREFIX=ghcr.io/donivanovich/dreamfive
IMAGE_TAG=main

POSTGRES_USER=dreamfive
POSTGRES_PASSWORD=<secreto-fuerte-postgres>
POSTGRES_DB=dreamfive
DATABASE_POOL_MAX=10

REDIS_PASSWORD=<secreto-fuerte-redis-min-16-chars>
REDIS_DB=0
QUEUE_PREFIX=dreamfive

API_CORS_ORIGINS=https://dreamfive.donivanovich.dev
API_TRUST_PROXY=true
AUTH_SESSION_TTL_HOURS=168
AUTH_COOKIE_NAME=dreamfive_session
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=120

WEB_PUBLIC_URL=https://dreamfive.donivanovich.dev
VITE_API_URL=/api
VITE_PUBLIC_URL=https://dreamfive.donivanovich.dev

SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=<tu-correo>
SMTP_PASS=<app-password>
SMTP_FROM=DreamFive <tu-correo>
UPLOAD_DIR=/app/uploads
```

> Nunca subas `.env` a Git. En `NODE_ENV=production`, la API bloquea el arranque si `REDIS_PASSWORD` tiene menos de 16 caracteres o si se intenta habilitar Swagger o `DEV_TOOLS_ENABLED`.

### Paso 3 — Autenticación en GHCR y primer arranque

```bash
# Si los paquetes GHCR son privados:
echo "<GHCR_READ_TOKEN>" | docker login ghcr.io -u donivanovich --password-stdin

# 1. Descargar imágenes ARM64 y levantar infraestructura de datos
docker compose -f docker-compose.prod.yml pull api worker web gateway
docker compose -f docker-compose.prod.yml --profile ops pull migrate
docker compose -f docker-compose.prod.yml up -d postgres redis

# 2. Aplicar migraciones Prisma
docker compose -f docker-compose.prod.yml --profile ops run --rm migrate

# 3. (SOLO primera instalación bajo autorización expresa) Cargar catálogo inicial:
# docker compose -f docker-compose.prod.yml --profile seed pull seed
# docker compose -f docker-compose.prod.yml --profile seed run --rm seed

# 4. Arrancar aplicación y gateway
docker compose -f docker-compose.prod.yml up -d api worker web gateway
```

---

## 3. Actualización de versiones y migraciones

El flujo recomendado es automático vía **GitHub Actions (`CI` → `CD`)**. Para actualizar manualmente en `/opt/docker/apps/DreamFive`:

```bash
cd /opt/docker/apps/DreamFive
export IMAGE_TAG=sha-<7-caracteres>   # o `main`

# 1. Descargar nuevas imágenes sin detener los servicios actuales
docker compose -f docker-compose.prod.yml --profile ops pull migrate
docker compose -f docker-compose.prod.yml pull api worker web gateway

# 2. Aplicar migraciones antes de sustituir contenedores de aplicación
docker compose -f docker-compose.prod.yml --profile ops run --rm migrate

# 3. Actualizar únicamente app + gateway (sin reiniciar postgres ni redis)
docker compose -f docker-compose.prod.yml up -d --no-deps --remove-orphans api worker web gateway
```

> **Advertencia:** no ejecutes nunca `docker compose down -v` en producción (destruiría los volúmenes `postgres-data`, `redis-data` y `api-uploads`). Tampoco ejecutes `seed` salvo en la inicialización de una base de datos vacía bajo autorización expresa.

---

## 4. Healthchecks, logs y diagnóstico

### Comprobación de salud desde la Raspberry Pi

```bash
# Estado y healthchecks de todos los contenedores
docker compose -f docker-compose.prod.yml ps

# Liveness del gateway Nginx
curl -fsS http://127.0.0.1:3000/gateway-health

# Readiness de la API (verifica conexión real a PostgreSQL y Redis)
curl -fsS http://127.0.0.1:3000/api/health/ready

# Respuesta SSR del frontend
curl -fsSI http://127.0.0.1:3000/

# Inspección del estado de salud de cada contenedor
docker inspect --format '{{.Name}}: {{.State.Status}} / {{if .State.Health}}{{.State.Health.Status}}{{else}}sin healthcheck{{end}}' \
  $(docker compose -f docker-compose.prod.yml ps -q)
```

### Consulta de logs

```bash
# Logs en vivo de gateway, API y worker
docker compose -f docker-compose.prod.yml logs -f --tail=100 gateway api worker web

# Diagnóstico específico de Cloudflare Tunnel en el host
sudo systemctl status cloudflared
journalctl -u cloudflared -n 50 --no-pager
```

---

## 5. Copias de seguridad y recuperación

Los datos persistentes residen exclusivamente en tres volúmenes Docker nombrados:

- `dreamfive_postgres-data`: base de datos PostgreSQL 18 (ligas, usuarios, partidos, historial, traspasos).
- `dreamfive_redis-data`: persistencia AOF de BullMQ.
- `dreamfive_api-uploads`: avatares subidos por los mánagers (`/app/uploads`).

### Backup lógico de PostgreSQL y avatares (en caliente, sin detener servicios)

```bash
cd /opt/docker/apps/DreamFive
mkdir -p backups
BACKUP_TS="$(date +%Y%m%d-%H%M%S)"

# Volcado SQL comprimido de PostgreSQL
source .env
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" --format=custom --compress=9 \
  > "backups/dreamfive-db-${BACKUP_TS}.dump"

# Copia de avatares subidos
docker run --rm \
  -v dreamfive_api-uploads:/source:ro \
  -v "$(pwd)/backups:/backup" \
  alpine:3.21 tar -czf "/backup/dreamfive-uploads-${BACKUP_TS}.tar.gz" -C /source .
```

### Restauración ante incidentes

```bash
cd /opt/docker/apps/DreamFive
source .env

# 1. Detener escrituras manteniendo PostgreSQL activo
docker compose -f docker-compose.prod.yml stop gateway web api worker

# 2. Restaurar volcado en PostgreSQL
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_restore -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" --clean --if-exists \
  < backups/dreamfive-db-<TIMESTAMP>.dump

# 3. Restaurar avatares (si procede)
docker run --rm \
  -v dreamfive_api-uploads:/target \
  -v "$(pwd)/backups:/backup:ro" \
  alpine:3.21 tar -xzf "/backup/dreamfive-uploads-<TIMESTAMP>.tar.gz" -C /target

# 4. Levantar de nuevo los servicios
docker compose -f docker-compose.prod.yml up -d api worker web gateway
```

---

## 6. Desarrollo local

### Opción A — Stack completo en Docker (misma arquitectura con gateway)

```bash
cp .env.example .env
pnpm docker:up
# o directamente: docker compose up -d --build
```

- **Acceso único:** `http://localhost:3000` (API en `/api`, Socket.IO en `/socket.io`).
- Si el puerto `3000` ya está ocupado en el host, `pnpm docker:up` busca automáticamente el primer puerto libre en `GATEWAY_PORT_RANGE` (`3000-3099`) y sincroniza `WEB_PUBLIC_URL`, `VITE_PUBLIC_URL` y `API_CORS_ORIGINS` manteniendo `VITE_API_URL=/api`. Puedes previsualizar el puerto asignado con `pnpm docker:ports`.

### Opción B — Apps en el host + PostgreSQL/Redis en Docker (`docker-compose.dev.yml`)

Útil para depuración con recarga en caliente (`vite dev` / `node --watch`):

```bash
pnpm docker:infra          # expone PostgreSQL (5432) y Redis (6379) solo en 127.0.0.1
pnpm run db:migrate:deploy
pnpm run db:seed
```

En este modo sin gateway Nginx, configura en tu `.env` local `VITE_API_URL=http://localhost:3001` y arranca en terminales separadas `pnpm dev:api`, `pnpm dev:worker` y `pnpm dev:web`.
