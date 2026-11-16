import { Processor, WorkerHost } from '@nestjs/bullmq';
import { advanceSeasonForLeague } from '@dream5/database';
import { QUEUE_NAMES, SOCKET_EVENTS } from '@dream5/shared';
import type { Job } from 'bullmq';

import { WorkerPrismaService } from '../database/worker-prisma.service.js';
import { RealtimePublisherService } from '../redis/worker-redis.module.js';
import type { SeasonRolloverJobData } from './job-payloads.js';

@Processor(QUEUE_NAMES.seasons)
export class SeasonsProcessor extends WorkerHost {
  constructor(
    private readonly prisma: WorkerPrismaService,
    private readonly realtime: RealtimePublisherService,
  ) {
    super();
  }

  async process(
    job: Job<SeasonRolloverJobData>,
  ): Promise<{ readonly newSeasonId: string; readonly newSeasonNumber: number }> {
    const result = await advanceSeasonForLeague(this.prisma.client, {
      leagueId: job.data.leagueId,
      ...(job.data.resetConfig ? { resetConfig: job.data.resetConfig } : {}),
    });

    if (job.data.simJobId) {
      await this.prisma.client.simulationJob.update({
        where: { id: job.data.simJobId },
        data: {
          seasonId: result.newSeasonId,
          status: 'COMPLETED',
          finishedAt: new Date(),
        },
      });
    }

    await this.realtime.publishLeagueEvent({
      leagueId: job.data.leagueId,
      eventType: SOCKET_EVENTS.seasonRollover,
      timestamp: new Date().toISOString(),
    });
    await this.realtime.publishLeagueEvent({
      leagueId: job.data.leagueId,
      eventType: SOCKET_EVENTS.mailUpdated,
      timestamp: new Date().toISOString(),
    });

    return {
      newSeasonId: result.newSeasonId,
      newSeasonNumber: result.newSeasonNumber,
    };
  }
}
