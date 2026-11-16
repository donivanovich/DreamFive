import { Global, Inject, Module, type OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';

import { API_ENV } from '../config/app-config.module.js';
import type { ApiEnv } from '../config/env.schema.js';

/** Token del cliente Redis de uso general (salud, futura caché, Socket.IO). */
export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

/** Opciones de conexión comunes a ioredis y BullMQ. */
export function buildRedisConnectionOptions(env: ApiEnv) {
  return {
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    db: env.REDIS_DB,
    ...(env.REDIS_PASSWORD ? { password: env.REDIS_PASSWORD } : {}),
  };
}

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [API_ENV],
      useFactory: (env: ApiEnv) =>
        new Redis({
          ...buildRedisConnectionOptions(env),
          lazyConnect: true,
          maxRetriesPerRequest: 1,
        }),
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule implements OnModuleDestroy {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async onModuleDestroy(): Promise<void> {
    if (this.redis.status !== 'end') {
      await this.redis.quit();
    }
  }
}
