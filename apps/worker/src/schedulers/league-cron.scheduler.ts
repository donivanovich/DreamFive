import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { JOB_NAMES, QUEUE_NAMES } from '@dream5/shared';
import type { Queue } from 'bullmq';

import type { WorkerEnv } from '../config/env.schema.js';
import { WORKER_ENV } from '../config/worker-config.module.js';

@Injectable()
export class LeagueCronScheduler implements OnModuleInit {
  private readonly logger = new Logger(LeagueCronScheduler.name);

  constructor(
    @Inject(WORKER_ENV) private readonly env: WorkerEnv,
    @InjectQueue(QUEUE_NAMES.simulation) private readonly simulationQueue: Queue,
    @InjectQueue(QUEUE_NAMES.market) private readonly marketQueue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.simulationQueue.upsertJobScheduler(
      'dream5-24x7-tick',
      { every: this.env.WORKER_SCHEDULER_INTERVAL_MS },
      {
        name: JOB_NAMES.schedulerTick,
        data: { source: 'bullmq-24x7-scheduler' },
        opts: { removeOnComplete: 5, removeOnFail: 10 },
      },
    );

    await this.marketQueue.upsertJobScheduler(
      'dream5-hourly-market',
      { every: 3600_000 },
      {
        name: JOB_NAMES.repriceLeagueMarket,
        data: { reason: 'Actualización horaria automática de precios' },
        opts: { removeOnComplete: 10, removeOnFail: 10 },
      },
    );

    this.logger.log(
      `Planificadores BullMQ 24/7 activos (tick cada ${String(this.env.WORKER_SCHEDULER_INTERVAL_MS)}ms)`,
      'LeagueCronScheduler',
    );
  }
}
