import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { createPrismaClient, type PrismaClient } from '@dream5/database';

import { API_ENV } from '../config/app-config.module.js';
import type { ApiEnv } from '../config/env.schema.js';

/**
 * Envoltorio NestJS del cliente Prisma compartido.
 *
 * La conexión se establece de forma perezosa en la primera consulta y se
 * cierra ordenadamente al apagar la aplicación.
 */
@Injectable()
export class PrismaService implements OnModuleDestroy {
  readonly client: PrismaClient;

  constructor(@Inject(API_ENV) env: ApiEnv) {
    this.client = createPrismaClient({
      connectionString: env.DATABASE_URL,
      maxConnections: env.DATABASE_POOL_MAX,
    });
  }

  /** Comprueba la conectividad con PostgreSQL. */
  async ping(): Promise<void> {
    await this.client.$queryRaw`SELECT 1`;
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}
