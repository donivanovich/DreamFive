import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ALL_QUEUE_NAMES } from '@dreamfive/shared';

import type { WorkerEnv } from '../config/env.schema.js';
import { buildRedisConnectionOptions, WORKER_ENV } from '../config/worker-config.module.js';
import { InjuriesProcessor, ProgressionProcessor } from '../processors/maintenance.processors.js';
import { MarketProcessor } from '../processors/market.processor.js';
import { RankingsProcessor } from '../processors/rankings.processor.js';
import { SeasonsProcessor } from '../processors/seasons.processor.js';
import { SimulationProcessor } from '../processors/simulation.processor.js';
import { LeagueCronScheduler } from '../schedulers/league-cron.scheduler.js';

/**
 * Conexión BullMQ del lado CONSUMIDOR (worker 24/7).
 */
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [WORKER_ENV],
      useFactory: (env: WorkerEnv) => ({
        connection: { ...buildRedisConnectionOptions(env), maxRetriesPerRequest: null },
        prefix: env.QUEUE_PREFIX,
      }),
    }),
    BullModule.registerQueue(...ALL_QUEUE_NAMES.map((name) => ({ name }))),
  ],
  providers: [
    SimulationProcessor,
    MarketProcessor,
    SeasonsProcessor,
    RankingsProcessor,
    InjuriesProcessor,
    ProgressionProcessor,
    LeagueCronScheduler,
  ],
  exports: [BullModule],
})
export class QueuesModule {}
