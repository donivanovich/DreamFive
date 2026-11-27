# Resolución de problemas habituales

## 1. Error al registrar usuario (`400 Bad Request` en nombre de mánager)

- **Causa:** el esquema compartido (`registerSchema`) exige entre 3 y 32 caracteres cumpliendo `^[a-zA-Z0-9._-]+$` (no admite espacios ni tildes).
- **Solución:** introduce un identificador tipo `manager_01` o `alex.v`.

## 2. El correo de verificación o cambio de contraseña no llega a tu bandeja

- **Causa:** faltan credenciales SMTP reales (`SMTP_USER` / `SMTP_PASS`) o se bloqueó el envío sin contraseña de aplicación en Gmail.
- **Solución:** configura en `.env` `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_SECURE=true`, `SMTP_USER=<tu-correo@gmail.com>` y `SMTP_PASS=<app-password-16-caracteres>`, y reinicia `api`.

## 3. Error `409 Conflict` al crear una segunda liga

- **Causa:** la regla v0.3 limita a **1 sola presidencia activa simultánea** por usuario, reforzada en NestJS y en PostgreSQL (`leagues_one_active_presidency_per_user`).
- **Solución:** para jugar en otra liga adicional, solicita a otro presidente que te invite mediante tu etiqueta `#D5-XXXX` desde la pantalla **My Leagues / Mis ligas**.

## 4. No aparece el apartado `Simulation` o responde `403 Forbidden`

- **Causa:** toda acción manual de simulación (`/simulation`, `/dev/leagues/*`, `POST /seasons/advance`) está restringida estrictamente al administrador autorizado; las cuentas estándar y la cuenta demo no tienen acceso.
- **Solución:** para el uso normal el `worker` 24/7 avanza automáticamente el calendario sin intervención manual.

## 5. Error `502 Bad Gateway` en `dreamfive.donivanovich.dev` o `http://localhost:3000`

- **Causa:** alguno de los upstreams internos (`web` o `api`) está arrancando, no superó su healthcheck o `cloudflared` no alcanza `localhost:3000`.
- **Solución:**
  1. Comprueba el estado de contenedores: `docker compose -f docker-compose.prod.yml ps` (o `docker compose ps` en local).
  2. Verifica los endpoints locales: `curl -fsS http://127.0.0.1:3000/gateway-health` y `curl -fsS http://127.0.0.1:3000/api/health/ready`.
  3. Revisa logs: `docker compose -f docker-compose.prod.yml logs --tail=80 gateway api web`.

## 6. No funcionan los eventos en tiempo real (Socket.IO / WebSockets)

- **Causa:** el proxy intermedio no reenvía `Upgrade`/`Connection`, el origen no está en `API_CORS_ORIGINS`, o `worker`/`redis` no están saludables.
- **Solución:**
  1. Verifica que `infrastructure/nginx/default.conf` mantiene los bloques `location /socket.io/` y `location /api/socket.io/` con `proxy_http_version 1.1`, `Upgrade`, `Connection` y `proxy_buffering off`.
  2. Comprueba en `.env` que `API_CORS_ORIGINS` incluye el origen público exacto (`https://dreamfive.donivanovich.dev` en producción o `http://localhost:3000` en local) y `API_TRUST_PROXY=true`.
  3. Verifica que `worker` y `redis` están `healthy` y que `GET http://127.0.0.1:3000/api/health/ready` devuelve `{"status":"ok","checks":{"database":"up","redis":"up"}}`.

## 7. Colisión en el puerto `3000` en desarrollo local

- **Solución:** usa `pnpm docker:up` (o `pnpm docker:ports` para previsualizar). El lanzador detecta si `3000` está ocupado y asigna automáticamente un puerto libre dentro de `GATEWAY_PORT_RANGE` (`3000-3099`), actualizando `WEB_PUBLIC_URL`, `VITE_PUBLIC_URL` y `API_CORS_ORIGINS` sin romper `VITE_API_URL=/api`.

## 8. Error de cookies o sesión tras desplegar detrás de Cloudflare Tunnel

- **Causa:** en `NODE_ENV=production` las cookies de sesión llevan el atributo `Secure`, por lo que requieren HTTPS extremo a extremo (Cloudflare Tunnel) y `API_TRUST_PROXY=true` + cabecera `X-Forwarded-Proto` reenviada por Nginx.
- **Solución:** confirma que accedes mediante `https://dreamfive.donivanovich.dev` y que `API_TRUST_PROXY=true` está activo en `.env`.
