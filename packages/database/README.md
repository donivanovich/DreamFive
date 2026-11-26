# `@dreamfive/database` — Persistencia PostgreSQL y Prisma ORM

Paquete centralizado para la definición del esquema de base de datos, migraciones y creación del cliente **Prisma ORM 7**.

## Responsabilidad

- Mantener `prisma/schema.prisma` y el historial de migraciones en `prisma/migrations/`.
- Configurar Prisma CLI (`prisma.config.ts`) cargando `DATABASE_URL` del entorno (o del `.env` raíz en local).
- Exportar la factoría `createPrismaClient()` configurada con el adaptador oficial `@prisma/adapter-pg` y pool de `pg`.

## Estado actual

El archivo `prisma/schema.prisma` contiene únicamente los bloques `generator client` y `datasource db`. **No se han creado modelos ni tablas de negocio** en esta fase de inicialización.

## Normas del paquete

- **Regeneración tras cambios:** tras modificar `schema.prisma`, ejecuta `pnpm run db:generate` (desde la raíz) antes de comprobar tipos en `api` o `worker`.
- **Migraciones versionadas:** nunca edites a mano migraciones ya aplicadas; usa `pnpm run db:migrate:dev` en desarrollo y `pnpm run db:migrate:deploy` en entornos desplegados.
- **Cliente generado fuera de Git:** `src/generated/` está excluido en `.gitignore` y se genera durante `build` o `db:generate`.
- **Aislamiento por liga:** todo futuro modelo mutable perteneciente a una liga deberá seguir las reglas de [docs/architecture/data-isolation.md](../../docs/architecture/data-isolation.md).
