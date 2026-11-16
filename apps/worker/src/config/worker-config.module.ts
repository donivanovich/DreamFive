import { type DynamicModule, Global, Module } from '@nestjs/common';

import type { WorkerEnv } from './env.schema.js';

/** Token de inyección de la configuración validada del worker. */
export const WORKER_ENV = Symbol('WORKER_ENV');

@Global()
@Module({})
export class WorkerConfigModule {
  static forRoot(env: WorkerEnv): DynamicModule {
    return {
      module: WorkerConfigModule,
      providers: [{ provide: WORKER_ENV, useValue: Object.freeze({ ...env }) }],
      exports: [WORKER_ENV],
    };
  }
}

/** Opciones de conexión Redis comunes a ioredis y BullMQ. */
export function buildRedisConnectionOptions(env: WorkerEnv) {
  return {
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    db: env.REDIS_DB,
    ...(env.REDIS_PASSWORD ? { password: env.REDIS_PASSWORD } : {}),
  };
}
