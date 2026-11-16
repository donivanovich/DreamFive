# Política de seguridad y auditoría

Este documento recoge las medidas de seguridad aplicadas en la inicialización de DREAM5, el proceso de auditoría de dependencias y los riesgos pendientes de abordar al implementar las funcionalidades del juego.

## Controles aplicados en esta inicialización

### 1. Cadena de suministro y gestión de dependencias

- **Versiones exactas:** `savePrefix: ''` en `pnpm-workspace.yaml` impide instalar rangos abiertos (`^` o `~`) al añadir dependencias.
- **Ventana de madurez (`minimumReleaseAge: 1440`):** pnpm rechaza versiones publicadas hace menos de 24 horas para mitigar ataques de robo de cuentas npm.
- **Scripts de ciclo de vida bloqueados por defecto (`allowBuilds`):** solo `@prisma/engines`, `@swc/core`, `esbuild` y `prisma` tienen permiso explícito de ejecutar scripts de instalación.
- **Peer dependencies estrictas (`strictPeerDependencies: true`):** prohibido usar `--force` o `--legacy-peer-deps`.
- **Catálogo centralizado (`catalog`):** evita duplicación de versiones de un mismo paquete en el monorepo.

### 2. Validación de entorno y gestión de secretos

- El repositorio no contiene contraseñas ni claves reales. `.env` está excluido en `.gitignore` y `.dockerignore`.
- Tanto `apps/api` como `apps/worker` validan su entorno al arrancar con Zod (_fail-fast_).
- En `NODE_ENV=production`:
  - `REDIS_PASSWORD` es obligatoria y debe tener al menos 16 caracteres.
  - `API_SWAGGER_ENABLED` no puede ser `true` (la API aborta el arranque si alguien intenta exponer Swagger en producción).
- Los errores de validación de entorno no imprimen los valores de las variables para evitar fugas en logs.
- En el frontend (`apps/web`), Vite solo expone al navegador variables con prefijo `VITE_`.

### 3. Seguridad HTTP, CORS y tiempo real

- **Helmet (`@fastify/helmet`):** cabeceras de seguridad activadas, `frameAncestors: ["'none'"]`, `crossOriginResourcePolicy: 'same-site'` y `HSTS` en producción. La CSP por defecto de la API bloquea scripts y recursos (`defaultSrc: ["'none'"]`).
- **CORS estricto:** `API_CORS_ORIGINS` valida que cada entrada sea un origen HTTP(S) explícito y rechaza comodines (`*`).
- **Límite de cuerpo:** `bodyLimit: 1_048_576` (1 MiB) en Fastify.
- **Gestión centralizada de errores:** `AllExceptionsFilter` oculta detalles y trazas en errores `5xx`.
- **Logs redactados:** `pino` censura `authorization`, `cookie` y `set-cookie`.
- **Socket.IO:** `SecureIoAdapter` aplica la misma lista blanca de orígenes CORS, desactiva `serveClient` y limita `maxHttpBufferSize` a 100 KB.

### 4. Endurecimiento de contenedores (Docker)

- **Versiones fijadas:** se evitan etiquetas `latest` (`node:24.22.3-alpine3.24`, `postgres:18.6-alpine3.24`, `redis:8.8.4-alpine3.23`).
- **Usuario sin privilegios:** los contenedores de `api`, `worker` y `web` se ejecutan como `node` (UID 1000).
- **Sistema de archivos de solo lectura (`read_only: true`)**, capacidades Linux eliminadas (`cap_drop: [ALL]`) y `no-new-privileges: true`.
- **Aislamiento de red:** `postgres`, `redis` y `worker` operan en la red `backend` marcada como `internal: true`. En `docker-compose.yml` no se publican puertos de PostgreSQL ni Redis; en desarrollo (`docker-compose.dev.yml`) se enlazan exclusivamente a `127.0.0.1`.
- **Redis protegido:** autenticación obligatoria por contraseña, `protected-mode yes`, persistencia AOF y política `maxmemory-policy noeviction` requerida por BullMQ.

## Requisitos de seguridad para fases posteriores

Cuando se implemente la lógica de negocio deberán añadirse:

- Autenticación (hash de contraseñas con Argon2id, tokens/sesiones con rotación y caducidad corta).
- Autorización por liga (_tenant isolation_): verificar membresía y rol (presidente vs. miembro) en cada endpoint y cada sala de Socket.IO.
- Limitación de tasa (_rate limiting_) en endpoints sensibles (login, registro, invitaciones, ofertas de intercambio).
- Validación de DTOs con Zod/pipes globales en Fastify y protección CSRF si se usan cookies de sesión.
- Escaneo de vulnerabilidades en imágenes Docker (p. ej. Trivy) en CI una vez que las imágenes se publiquen en un registro.

## Registro de auditoría de dependencias

El resultado de `pnpm audit` y cualquier hallazgo detectado durante la inicialización se documentan en [dependency-audit.md](./dependency-audit.md).
