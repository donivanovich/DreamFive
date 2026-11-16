import { Processor, WorkerHost } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '@dream5/shared';
import type { Job } from 'bullmq';

import { WorkerPrismaService } from '../database/worker-prisma.service.js';
import type { LeagueMaintenanceJobData } from './job-payloads.js';

@Processor(QUEUE_NAMES.injuries)
export class InjuriesProcessor extends WorkerHost {
  constructor(private readonly prisma: WorkerPrismaService) {
    super();
  }

  async process(job: Job<LeagueMaintenanceJobData>): Promise<{ readonly activeCount: number }> {
    const activeCount = await this.prisma.client.injury.count({
      where: { leagueId: job.data.leagueId, active: true },
    });
    return { activeCount };
  }
}

@Processor(QUEUE_NAMES.progression)
export class ProgressionProcessor extends WorkerHost {
  constructor(private readonly prisma: WorkerPrismaService) {
    super();
  }

  async process(
    job: Job<LeagueMaintenanceJobData>,
  ): Promise<{ readonly evaluatedPlayers: number }> {
    const evaluatedPlayers = await this.prisma.client.playerInstance.count({
      where: { leagueId: job.data.leagueId, isRetired: false },
    });
    return { evaluatedPlayers };
  }
}
