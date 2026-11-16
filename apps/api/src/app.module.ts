import { type DynamicModule, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';

import { AppConfigModule } from './config/app-config.module.js';
import type { ApiEnv } from './config/env.schema.js';
import { buildLoggerParams } from './config/logger.config.js';
import { DatabaseModule } from './database/database.module.js';
import { AllExceptionsFilter } from './filters/all-exceptions.filter.js';
import { HealthModule } from './health/health.module.js';
import { FEATURE_MODULES } from './modules/index.js';
import { QueuesModule } from './queues/queues.module.js';
import { RealtimeModule } from './realtime/realtime.module.js';
import { RedisModule } from './redis/redis.module.js';

/**
 * Módulo raíz de la API.
 *
 * Se construye dinámicamente a partir del entorno ya validado para que
 * ninguna dependencia lea `process.env` directamente.
 */
@Module({})
export class AppModule {
  static forRoot(env: ApiEnv): DynamicModule {
    return {
      module: AppModule,
      imports: [
        AppConfigModule.forRoot(env),
        LoggerModule.forRoot(buildLoggerParams(env)),
        DatabaseModule,
        RedisModule,
        QueuesModule,
        RealtimeModule,
        HealthModule,
        ...FEATURE_MODULES,
      ],
      providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
    };
  }
}
