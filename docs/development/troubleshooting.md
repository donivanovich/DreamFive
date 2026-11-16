# Resolución de problemas habituales

## 1. Error al registrar usuario (`400 Bad Request` en nombre de mánager)

- **Causa:** el esquema compartido (`registerSchema`) exige entre 3 y 32 caracteres cumpliendo `^[a-zA-Z0-9._-]+$` (no admite espacios ni tildes).
- **Solución:** introduce un identificador tipo `ivan.kovac` o `manager_01`.

## 2. El correo de verificación o cambio de contraseña no llega a tu bandeja

- **Causa:** faltan credenciales SMTP reales (`SMTP_USER` / `SMTP_PASS`) o se bloqueó el envío sin contraseña de aplicación en Gmail.
- **Solución:** configura en `.env` `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_SECURE=true`, `SMTP_USER=<tu-correo@gmail.com>` y `SMTP_PASS=<app-password-16-caracteres>`, y reinicia `api`.

## 3. Error `409 Conflict` al crear una segunda liga

- **Causa:** la regla v0.3 limita a **1 sola presidencia activa simultánea** por usuario, reforzada en NestJS y en PostgreSQL (`leagues_one_active_presidency_per_user`).
- **Solución:** para jugar en otra liga adicional, solicita a otro presidente que te invite mediante tu etiqueta `#D5-XXXX` desde la pantalla **My Leagues / Mis ligas**.

## 4. No aparece el apartado `Simulation` o responde `403 Forbidden`

- **Causa:** toda acción manual de simulación (`/simulation`, `/dev/leagues/*`, `POST /seasons/advance`) está restringida estrictamente al administrador `ivan.k@dream5.local`.
- **Solución:** inicia sesión con `ivan.k@dream5.local` si necesitas ejecutar rondas manualmente; para el resto de cuentas el worker 24/7 avanza automáticamente el calendario.

## 5. Colisión de puertos locales (`3000` o `3001` ocupados)

- **Solución:** `.env` usa por defecto `WEB_PORT=3100` y `API_PORT=3101`. Si cambias `API_PORT` o `WEB_PORT`, actualiza también `VITE_API_URL`, `WEB_PUBLIC_URL` y `API_CORS_ORIGINS` y reconstruye `web`.

## 6. No aparecen cambios en tiempo real

- **Solución:** comprueba con `docker compose logs worker api` y `GET http://localhost:3101/health/ready` que PostgreSQL, Redis y `worker` estén saludables y usando la misma contraseña de Redis.
