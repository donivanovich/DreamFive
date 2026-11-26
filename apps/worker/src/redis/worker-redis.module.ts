import { Global, Inject, Injectable, Logger, Module, type OnModuleDestroy } from '@nestjs/common';
import { REDIS_CHANNELS, type RealtimeLeagueEventPayload } from '@dreamfive/shared';
import { Redis } from 'ioredis';

import type { WorkerEnv } from '../config/env.schema.js';
import { buildRedisConnectionOptions, WORKER_ENV } from '../config/worker-config.module.js';

export const WORKER_REDIS_CLIENT = Symbol('WORKER_REDIS_CLIENT');

@Injectable()
export class RealtimePublisherService {
  private readonly logger = new Logger(RealtimePublisherService.name);

  constructor(@Inject(WORKER_REDIS_CLIENT) private readonly redis: Redis) {}

  async publishLeagueEvent(event: RealtimeLeagueEventPayload): Promise<void> {
    try {
      await this.redis.publish(REDIS_CHANNELS.leagueRealtimeEvents, JSON.stringify(event));
    } catch (error: unknown) {
      this.logger.warn(
        `No se pudo publicar evento tiempo real ${event.eventType}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

@Global()
@Module({
  providers: [
    {
      provide: WORKER_REDIS_CLIENT,
      inject: [WORKER_ENV],
      useFactory: (env: WorkerEnv) =>
        new Redis({
          ...buildRedisConnectionOptions(env),
          lazyConnect: true,
          maxRetriesPerRequest: 2,
        }),
    },
    RealtimePublisherService,
  ],
  exports: [WORKER_REDIS_CLIENT, RealtimePublisherService],
})
export class WorkerRedisModule implements OnModuleDestroy {
  constructor(@Inject(WORKER_REDIS_CLIENT) private readonly redis: Redis) {}

  async onModuleDestroy(): Promise<void> {
    if (this.redis.status !== 'end') {
      await this.redis.quit();
    }
  }
}
