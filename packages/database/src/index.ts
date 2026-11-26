/**
 * Punto de entrada público de @dreamfive/database.
 *
 * Expone una factoría de PrismaClient independiente de cualquier framework.
 * Las aplicaciones (API y worker) la envuelven en su propio proveedor de
 * NestJS y gestionan el ciclo de vida de la conexión.
 */
import { PrismaPg } from '@prisma/adapter-pg';

import { Prisma, PrismaClient } from './generated/prisma/client.js';

export { Prisma, PrismaClient };
export type * from './generated/prisma/client.js';
export * from './security/password.js';
export * from './services/league-bootstrap.js';
export * from './services/league-deletion.js';
export * from './services/league-mail.js';
export * from './services/simulation-runner.js';
export * from './services/transfer-engine.js';

export interface CreatePrismaClientOptions {
  /** Cadena de conexión PostgreSQL (DATABASE_URL). */
  readonly connectionString: string;
  /** Número máximo de conexiones del pool de `pg`. */
  readonly maxConnections?: number;
}

/**
 * Crea un PrismaClient que usa el driver adapter oficial de PostgreSQL.
 * No abre la conexión hasta la primera consulta o `$connect()`.
 */
export function createPrismaClient(options: CreatePrismaClientOptions): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: options.connectionString,
    max: options.maxConnections ?? 10,
  });
  return new PrismaClient({ adapter });
}
