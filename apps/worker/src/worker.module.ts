import { type DynamicModule, Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';

import type { WorkerEnv } from './config/env.schema.js';
import { buildLoggerParams } from './config/logger.config.js';
import { WorkerConfigModule } from './config/worker-config.module.js';
import { WorkerDatabaseModule } from './database/worker-database.module.js';
import { HealthModule } from './health/health.module.js';
import { QueuesModule } from './queues/queues.module.js';
import { WorkerRedisModule } from './redis/worker-redis.module.js';

/**
 * Módulo raíz del worker. No expone HTTP: es un contexto de aplicación
 * NestJS independiente de la API con operación 24/7 mediante BullMQ.
 */
@Module({})
export class WorkerModule {
  static forRoot(env: WorkerEnv): DynamicModule {
    return {
      module: WorkerModule,
      imports: [
        WorkerConfigModule.forRoot(env),
        LoggerModule.forRoot(buildLoggerParams(env)),
        WorkerDatabaseModule,
        WorkerRedisModule,
        QueuesModule,
        HealthModule,
      ],
    };
  }
}
