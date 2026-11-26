# `@dreamfive/api` — Backend HTTP y Tiempo Real

Servicio API de DreamFive construido con **NestJS** sobre el adaptador **Fastify** y servidor **Socket.IO**.

## Responsabilidad

- Exponer la API HTTP y los canales en tiempo real por liga.
- Validar variables de entorno al inicio (_fail-fast_ con Zod en `src/config/env.schema.ts`).
- Aplicar seguridad HTTP (`@fastify/helmet`, CORS restringido, límite de payload, ocultación de errores `5xx`).
- Actuar exclusivamente como **productor** en BullMQ (`src/queues/queues.module.ts`): encola trabajos pero nunca los procesa.
- Exponer `/health` (liveness) y `/health/ready` (readiness de PostgreSQL y Redis).

## Organización interna

```text
src/
├── config/       # Validación de entorno, Helmet/CORS, Pino logger y Swagger
├── database/     # Módulo global con PrismaService (envuelve @dreamfive/database)
├── redis/        # Cliente ioredis compartido y opciones comunes de conexión
├── queues/       # Registro de colas BullMQ en modo productor
├── realtime/     # Adaptador seguro y Gateway de Socket.IO
├── health/       # Endpoints técnicos /health y /health/ready
├── filters/      # Filtro global de excepciones HTTP
├── guards/       # Reservado para guards de autenticación y autorización por liga
├── interceptors/ # Reservado para interceptores transversales
├── common/       # Reservado para decoradores, pipes y utilidades comunes
├── modules/      # Módulos de dominio vacíos preparados para la fase funcional
├── app.module.ts # Composición raíz
└── main.ts       # Arranque Fastify + seguridad + Socket.IO
```

## Normas del paquete

- **Imports ESM (`NodeNext`):** toda importación relativa usa extensión `.js`.
- **Inyección de dependencias:** las clases inyectadas por constructor deben importarse como valor (nunca `import type`) para conservar `emitDecoratorMetadata`.
- **Swagger:** prohibido en producción; `parseApiEnv` impide el arranque si `NODE_ENV=production` y `API_SWAGGER_ENABLED=true`.
- **Logging:** prohibido `console.*`; usa `Logger` de `@nestjs/common` respaldado por `nestjs-pino`.
