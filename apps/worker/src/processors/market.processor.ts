import { Processor, WorkerHost } from '@nestjs/bullmq';
import { repriceLeagueMarket } from '@dream5/database';
import { JOB_NAMES, QUEUE_NAMES, SOCKET_EVENTS } from '@dream5/shared';
import type { Job } from 'bullmq';

import { WorkerPrismaService } from '../database/worker-prisma.service.js';
import { RealtimePublisherService } from '../redis/worker-redis.module.js';
import type { RepriceMarketJobData } from './job-payloads.js';

@Processor(QUEUE_NAMES.market)
export class MarketProcessor extends WorkerHost {
  constructor(
    private readonly prisma: WorkerPrismaService,
    private readonly realtime: RealtimePublisherService,
  ) {
    super();
  }

  async process(job: Job<RepriceMarketJobData>): Promise<{ readonly repricedLeagues: number }> {
    const data = job.data;
    const reason = data.reason || 'Recálculo horario de mercado';

    if (data.leagueId) {
      await repriceLeagueMarket(this.prisma.client, {
        leagueId: data.leagueId,
        reason,
      });
      await this.realtime.publishLeagueEvent({
        leagueId: data.leagueId,
        eventType: SOCKET_EVENTS.marketUpdated,
        timestamp: new Date().toISOString(),
      });
      if (data.simJobId) {
        await this.prisma.client.simulationJob.update({
          where: { id: data.simJobId },
          data: { status: 'COMPLETED', finishedAt: new Date() },
        });
      }
      return { repricedLeagues: 1 };
    }

    const activeLeagues = await this.prisma.client.league.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true },
    });

    for (const league of activeLeagues) {
      await repriceLeagueMarket(this.prisma.client, {
        leagueId: league.id,
        reason: `${reason} (${JOB_NAMES.repriceLeagueMarket})`,
      });
      await this.realtime.publishLeagueEvent({
        leagueId: league.id,
        eventType: SOCKET_EVENTS.marketUpdated,
        timestamp: new Date().toISOString(),
      });
    }

    return { repricedLeagues: activeLeagues.length };
  }
}
