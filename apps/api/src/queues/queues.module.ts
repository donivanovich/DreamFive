import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ALL_QUEUE_NAMES } from '@dream5/shared';

import { API_ENV } from '../config/app-config.module.js';
import type { ApiEnv } from '../config/env.schema.js';
import { buildRedisConnectionOptions } from '../redis/redis.module.js';

/**
 * Registro de colas BullMQ en el lado PRODUCTOR (API).
 *
 * La API solo encola trabajos; nunca los procesa. Los consumidores
 * (processors) viven exclusivamente en `apps/worker`. Los módulos de negocio
 * inyectarán las colas con `@InjectQueue(QUEUE_NAMES.x)` cuando se
 * implementen.
 */
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [API_ENV],
      useFactory: (env: ApiEnv) => ({
        connection: buildRedisConnectionOptions(env),
        prefix: env.QUEUE_PREFIX,
      }),
    }),
    BullModule.registerQueue(...ALL_QUEUE_NAMES.map((name) => ({ name }))),
  ],
  exports: [BullModule],
})
export class QueuesModule {}
