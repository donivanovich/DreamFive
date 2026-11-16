/**
 * Configuración de Prisma CLI (Prisma ORM 7).
 *
 * La URL de conexión se lee de la variable DATABASE_URL. En desarrollo local
 * se carga automáticamente desde el `.env` de la raíz del monorepo si existe;
 * en Docker/CI se inyecta como variable de entorno.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { defineConfig } from 'prisma/config';

const rootEnvFile = resolve(import.meta.dirname, '../../.env');
if (existsSync(rootEnvFile)) {
  process.loadEnvFile(rootEnvFile);
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // `prisma generate` y `prisma validate` no necesitan conexión; las
    // migraciones fallarán con un error explícito si la variable no existe.
    url: process.env['DATABASE_URL'] ?? '',
  },
});
