# Guía de desarrollo y operación

## Requisitos previos

- **Docker y Docker Compose:** para levantar todo el stack completo (`gateway`, `web`, `api`, `worker`, `postgres`, `redis`, `migrate`, `seed`).
- **Node.js y pnpm** _(opcional, solo para tests locales o edición directa)_: `>=24.12.0 <25` (`.nvmrc`: `24.22.3`) y `pnpm@12.18.0`.

## Arranque completo en contenedores (flujo estándar)

1. **Preparar variables de entorno** (solo la primera vez):

   ```bash
   cp .env.example .env
   ```

2. **Construir e iniciar toda la plataforma:**

   ```bash
   pnpm docker:up
   # o directamente: docker compose up -d --build
   ```

   Docker Compose ejecuta automáticamente `migrate` y `seed` sobre PostgreSQL antes de iniciar `api`, `worker`, `web` y el `gateway` Nginx (configura `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER` y `SMTP_PASS` en `.env` para correo real, p. ej. Gmail).

3. **Acceso único (a través del gateway Nginx):**
   - Aplicación web + API (`/api`) + Socket.IO (`/socket.io`): `http://localhost:3000`
   - Healthcheck del gateway: `http://localhost:3000/gateway-health`
   - Readiness de la API: `http://localhost:3000/api/health/ready`
   - Ni `web`, ni `api`, ni `postgres`, ni `redis` publican puertos directos en el host. Para el flujo de producción en Raspberry Pi 5 (`/opt/docker/apps/DreamFive`), consulta [local-setup.md](./local-setup.md).

## Comprobación previa a un commit o PR

```bash
pnpm run check
```

Este comando ejecuta en orden:

1. `prettier --check .`
2. `eslint . --max-warnings=0`
3. `typecheck` (compila los paquetes compartidos y verifica tipos de todo el monorepo)
4. `test` (ejecuta las suites de Vitest)

## Convenciones clave

- **TypeScript estricto:** no desactives reglas (`any`, `@ts-ignore`, etc.).
- **Imports en paquetes Node/NestJS:** usa extensión `.js` en rutas relativas (resolución `NodeNext`).
- **Inyección de dependencias en NestJS:** importa las clases inyectadas en constructores como valores (nunca `import type`), necesario para `emitDecoratorMetadata`.
- **Logging:** `no-console` está activado en ESLint; usa el `Logger` de NestJS (`nestjs-pino`) en API y worker.
- **Motor de simulación:** no importes módulos de Node.js, NestJS, Prisma ni React dentro de `packages/simulation-engine`.
