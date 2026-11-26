import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { createPrismaClient, type PrismaClient } from '@dreamfive/database';

import type { WorkerEnv } from '../config/env.schema.js';
import { WORKER_ENV } from '../config/worker-config.module.js';

@Injectable()
export class WorkerPrismaService implements OnModuleDestroy {
  readonly client: PrismaClient;

  constructor(@Inject(WORKER_ENV) env: WorkerEnv) {
    this.client = createPrismaClient({
      connectionString: env.DATABASE_URL,
      maxConnections: env.DATABASE_POOL_MAX,
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}
