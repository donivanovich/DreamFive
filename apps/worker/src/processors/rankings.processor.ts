import { Processor, WorkerHost } from '@nestjs/bullmq';
import { recalculateRoundStandingsInTx } from '@dreamfive/database';
import { QUEUE_NAMES, SOCKET_EVENTS } from '@dreamfive/shared';
import type { Job } from 'bullmq';

import { WorkerPrismaService } from '../database/worker-prisma.service.js';
import { RealtimePublisherService } from '../redis/worker-redis.module.js';
import type { RecalculateRankingsJobData } from './job-payloads.js';

@Processor(QUEUE_NAMES.rankings)
export class RankingsProcessor extends WorkerHost {
  constructor(
    private readonly prisma: WorkerPrismaService,
    private readonly realtime: RealtimePublisherService,
  ) {
    super();
  }

  async process(job: Job<RecalculateRankingsJobData>): Promise<{ readonly ok: boolean }> {
    await this.prisma.client.$transaction(async (tx) => {
      await recalculateRoundStandingsInTx(tx, {
        leagueId: job.data.leagueId,
        seasonId: job.data.seasonId,
        roundNumber: job.data.roundNumber,
      });
    });

    await this.realtime.publishLeagueEvent({
      leagueId: job.data.leagueId,
      eventType: SOCKET_EVENTS.standingsUpdated,
      roundNumber: job.data.roundNumber,
      timestamp: new Date().toISOString(),
    });

    return { ok: true };
  }
}
