# `infrastructure/` — Contenedores, Gateway, Scripts y Monitorización

Agrupa los artefactos operativos e infraestructura como código de DreamFive.

## Contenido

- `nginx/default.conf`: configuración del **gateway Nginx** (`nginx:1.28.3-alpine`), único punto de entrada con puerto publicado en el host (`127.0.0.1:3000 -> 80`). Enruta `/api/*` y `/uploads/*` hacia `api:3001`, `/socket.io/` y `/api/socket.io/` hacia `api:3001/socket.io/` con soporte WebSocket (`Upgrade`/`Connection`, `proxy_buffering off`, timeouts de `3600s`), `/gateway-health` para liveness y `/` hacia `web:3000`, usando el DNS embebido de Docker (`127.0.0.11`) para re-resolver upstreams tras reinicios sin caídas.
- `docker/node.Dockerfile`: _Dockerfile_ multi-etapa único que genera las imágenes `api`, `worker`, `web`, `migrate` y `seed` a partir de `node:24.22.3-alpine3.24` (compatible con `linux/amd64` y `linux/arm64` en Raspberry Pi 5), con `VITE_API_URL=/api` por defecto, usuario sin privilegios (`node`, UID 1000) y `tini` como PID 1.
- `scripts/`:
  - `docker-compose-up.mjs`: lanzador usado por `pnpm docker:up`, `pnpm docker:infra` y `pnpm docker:ports` que resuelve puertos libres dentro del rango `GATEWAY_PORT_RANGE` (o `POSTGRES_PORT_RANGE` / `REDIS_PORT_RANGE` en modo `--infra`) cuando el puerto preferido ya está ocupado y sincroniza `WEB_PUBLIC_URL`, `VITE_PUBLIC_URL` y `API_CORS_ORIGINS` conservando `VITE_API_URL=/api`.
  - `port-range-utils.mjs` y `port-range-utils.test.mjs`: utilidades puras y pruebas unitarias de resolución de rangos de puertos.
- `monitoring/`: reservado para configuraciones futuras de métricas, alertas o tableros de observabilidad.

## Normas del directorio

- **Sin secretos ni credenciales:** nunca almacenes contraseñas, certificados ni `.env` aquí.
- **Versiones fijadas:** toda imagen base en `docker/` o en los archivos Compose de la raíz usa etiquetas específicas (`node:24.22.3-alpine3.24`, `nginx:1.28.3-alpine`, `postgres:18.6-alpine3.24`, `redis:8.8.4-alpine3.23`); prohibido `latest`.
- **Exposición mínima:** solo `gateway` publica un puerto en `127.0.0.1`; `web`, `api`, `worker`, `postgres` y `redis` permanecen estrictamente en redes internas de Docker.
- **Contexto raíz:** `node.Dockerfile` se construye con la raíz del monorepo como contexto de build.
