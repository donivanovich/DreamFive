# `@dreamfive/shared` — Contratos y Constantes Compartidas

Paquete ligero con artefactos compartidos entre `apps/web`, `apps/api` y `apps/worker`.

## Responsabilidad

- `src/constants/`: identificadores técnicos compartidos, como `QUEUE_NAMES` para alinear los nombres de colas entre productor (`api`) y consumidor (`worker`).
- `src/enums/`: reservado para enumeraciones del dominio (posiciones `PG..C`, roles, estados de partido).
- `src/schemas/`: reservado para esquemas de validación compartidos entre cliente y servidor.
- `src/types/`: reservado para contratos TypeScript compartidos (DTOs, payloads de eventos).

## Normas del paquete

- **Sin lógica de negocio ni acceso a I/O:** no debe importar Prisma, Redis, NestJS ni React.
- **Cero efectos secundarios:** `sideEffects: false` en `package.json` para facilitar _tree-shaking_ en el frontend.
- **Compilación previa:** las aplicaciones consumen los archivos compilados en `dist/`. Si añades exports aquí, ejecuta `pnpm run build:packages`.
