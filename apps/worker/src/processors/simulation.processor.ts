import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import {
  recalculateRoundStandingsInTx,
  repriceLeagueMarket,
  runAutonomousCpuTransfersInTx,
  simulateRoundForLeague,
  simulateSingleMatchInTx,
} from '@dream5/database';
import { JOB_NAMES, QUEUE_NAMES, SOCKET_EVENTS } from '@dream5/shared';
import type { Job, Queue } from 'bullmq';

import { WorkerPrismaService } from '../database/worker-prisma.service.js';
import { RealtimePublisherService } from '../redis/worker-redis.module.js';
import type { SimulateMatchJobData, SimulateRoundJobData } from './job-payloads.js';

@Processor(QUEUE_NAMES.simulation)
export class SimulationProcessor extends WorkerHost {
  private readonly logger = new Logger(SimulationProcessor.name);

  constructor(
    private readonly prisma: WorkerPrismaService,
    private readonly realtime: RealtimePublisherService,
    @InjectQueue(QUEUE_NAMES.simulation) private readonly simulationQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<unknown>): Promise<unknown> {
    if (job.name === JOB_NAMES.schedulerTick) {
      return this.handleSchedulerTick();
    }
    if (job.name === JOB_NAMES.simulateRound) {
      return this.handleSimulateRound(job.data as SimulateRoundJobData, job.id ?? undefined);
    }
    if (job.name === JOB_NAMES.simulateMatch) {
      return this.handleSimulateMatch(job.data as SimulateMatchJobData, job.id ?? undefined);
    }
    this.logger.warn(`Trabajo de simulación desconocido ignorado: ${job.name}`);
    return null;
  }

  private async handleSchedulerTick(): Promise<{ readonly scheduledRoundsQueued: number }> {
    const now = Date.now();
    const activeLeagues = await this.prisma.client.league.findMany({
      where: { status: 'ACTIVE' },
      include: {
        seasons: {
          where: { status: 'ACTIVE' },
          orderBy: { seasonNumber: 'desc' },
          take: 1,
        },
      },
    });

    let scheduledRoundsQueued = 0;

    for (const league of activeLeagues) {
      const activeSeason = league.seasons[0];
      if (!activeSeason) {
        continue;
      }

      // Tiempo real 1:1 desde el último tick registrado para permitir operación 24/7
      const elapsedMs = Math.max(0, Math.min(24 * 3600_000, now - league.updatedAt.getTime()));
      const nextGameClock = new Date(league.gameClockAt.getTime() + elapsedMs);

      await this.prisma.client.league.update({
        where: { id: league.id },
        data: { gameClockAt: nextGameClock },
      });

      const dueRounds = await this.prisma.client.match.findMany({
        where: {
          leagueId: league.id,
          seasonId: activeSeason.id,
          status: 'SCHEDULED',
          scheduledAt: { lte: nextGameClock },
        },
        distinct: ['roundNumber'],
        select: { roundNumber: true },
        orderBy: { roundNumber: 'asc' },
      });

      for (const r of dueRounds) {
        const bullJobId = `sim_${league.id}_${activeSeason.id}_r${String(r.roundNumber)}`;
        await this.simulationQueue.add(
          JOB_NAMES.simulateRound,
          {
            leagueId: league.id,
            roundNumber: r.roundNumber,
          } satisfies SimulateRoundJobData,
          {
            jobId: bullJobId,
            removeOnComplete: 50,
            removeOnFail: 20,
          },
        );
        scheduledRoundsQueued += 1;
      }
    }

    return { scheduledRoundsQueued };
  }

  private async handleSimulateRound(
    data: SimulateRoundJobData,
    bullJobId?: string,
  ): Promise<{ readonly matchesSimulated: number }> {
    const jobRecord = data.simJobId
      ? await this.prisma.client.simulationJob.update({
          where: { id: data.simJobId },
          data: { status: 'RUNNING', bullmqJobId: bullJobId ?? null },
        })
      : await this.prisma.client.simulationJob.create({
          data: {
            leagueId: data.leagueId,
            jobType: JOB_NAMES.simulateRound,
            targetRound: data.roundNumber,
            bullmqJobId: bullJobId ?? null,
            status: 'RUNNING',
            seed: `${data.leagueId}:r${String(data.roundNumber)}`,
          },
        });

    try {
      const result = await simulateRoundForLeague(this.prisma.client, {
        leagueId: data.leagueId,
        roundNumber: data.roundNumber,
      });

      await this.prisma.client.simulationJob.update({
        where: { id: jobRecord.id },
        data: {
          seasonId: result.seasonId,
          status: 'COMPLETED',
          finishedAt: new Date(),
        },
      });

      await this.realtime.publishLeagueEvent({
        leagueId: data.leagueId,
        eventType: SOCKET_EVENTS.roundCompleted,
        roundNumber: result.roundNumber,
        timestamp: new Date().toISOString(),
      });
      await this.realtime.publishLeagueEvent({
        leagueId: data.leagueId,
        eventType: SOCKET_EVENTS.standingsUpdated,
        roundNumber: result.roundNumber,
        timestamp: new Date().toISOString(),
      });

      if (result.matchesSimulated > 0) {
        await this.realtime.publishLeagueEvent({
          leagueId: data.leagueId,
          eventType: SOCKET_EVENTS.marketUpdated,
          roundNumber: result.roundNumber,
          timestamp: new Date().toISOString(),
        });
        await this.realtime.publishLeagueEvent({
          leagueId: data.leagueId,
          eventType: SOCKET_EVENTS.transferUpdated,
          roundNumber: result.roundNumber,
          timestamp: new Date().toISOString(),
        });
        await this.realtime.publishLeagueEvent({
          leagueId: data.leagueId,
          eventType: SOCKET_EVENTS.mailUpdated,
          roundNumber: result.roundNumber,
          timestamp: new Date().toISOString(),
        });
      }

      return { matchesSimulated: result.matchesSimulated };
    } catch (error: unknown) {
      await this.prisma.client.simulationJob.update({
        where: { id: jobRecord.id },
        data: {
          status: 'FAILED',
          finishedAt: new Date(),
          errorMessage: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }
  }

  private async handleSimulateMatch(
    data: SimulateMatchJobData,
    bullJobId?: string,
  ): Promise<{ readonly homeScore: number; readonly awayScore: number }> {
    const jobRecord = data.simJobId
      ? await this.prisma.client.simulationJob.update({
          where: { id: data.simJobId },
          data: { status: 'RUNNING', bullmqJobId: bullJobId ?? null },
        })
      : await this.prisma.client.simulationJob.create({
          data: {
            leagueId: data.leagueId,
            jobType: JOB_NAMES.simulateMatch,
            targetMatchId: data.matchId,
            bullmqJobId: bullJobId ?? null,
            status: 'RUNNING',
            seed: `${data.leagueId}:m:${data.matchId}`,
          },
        });

    try {
      const outcome = await this.prisma.client.$transaction(
        async (tx) => {
          const matchRes = await simulateSingleMatchInTx(tx, {
            leagueId: data.leagueId,
            matchId: data.matchId,
          });
          await recalculateRoundStandingsInTx(tx, {
            leagueId: data.leagueId,
            seasonId: matchRes.seasonId,
            roundNumber: matchRes.roundNumber,
          });
          return matchRes;
        },
        { timeout: 30000, maxWait: 10000 },
      );

      await this.prisma.client.simulationJob.update({
        where: { id: jobRecord.id },
        data: {
          seasonId: outcome.seasonId,
          targetRound: outcome.roundNumber,
          status: 'COMPLETED',
          finishedAt: new Date(),
        },
      });

      await this.realtime.publishLeagueEvent({
        leagueId: data.leagueId,
        eventType: SOCKET_EVENTS.matchUpdated,
        roundNumber: outcome.roundNumber,
        matchId: outcome.matchId,
        timestamp: new Date().toISOString(),
      });
      await this.realtime.publishLeagueEvent({
        leagueId: data.leagueId,
        eventType: SOCKET_EVENTS.standingsUpdated,
        roundNumber: outcome.roundNumber,
        timestamp: new Date().toISOString(),
      });

      const remainingInRound = await this.prisma.client.match.count({
        where: {
          leagueId: data.leagueId,
          seasonId: outcome.seasonId,
          roundNumber: outcome.roundNumber,
          status: 'SCHEDULED',
        },
      });
      if (remainingInRound === 0) {
        await this.prisma.client.season.update({
          where: { id: outcome.seasonId },
          data: { currentRoundNumber: outcome.roundNumber },
        });
        await repriceLeagueMarket(this.prisma.client, {
          leagueId: data.leagueId,
          reason: `Post-jornada ${String(outcome.roundNumber)}`,
        });
        await this.prisma.client.$transaction((tx) =>
          runAutonomousCpuTransfersInTx(tx, {
            leagueId: data.leagueId,
            seasonId: outcome.seasonId,
            roundNumber: outcome.roundNumber,
          }),
        );
        await this.realtime.publishLeagueEvent({
          leagueId: data.leagueId,
          eventType: SOCKET_EVENTS.roundCompleted,
          roundNumber: outcome.roundNumber,
          timestamp: new Date().toISOString(),
        });
        await this.realtime.publishLeagueEvent({
          leagueId: data.leagueId,
          eventType: SOCKET_EVENTS.marketUpdated,
          roundNumber: outcome.roundNumber,
          timestamp: new Date().toISOString(),
        });
        await this.realtime.publishLeagueEvent({
          leagueId: data.leagueId,
          eventType: SOCKET_EVENTS.transferUpdated,
          roundNumber: outcome.roundNumber,
          timestamp: new Date().toISOString(),
        });
        await this.realtime.publishLeagueEvent({
          leagueId: data.leagueId,
          eventType: SOCKET_EVENTS.mailUpdated,
          roundNumber: outcome.roundNumber,
          timestamp: new Date().toISOString(),
        });
      }

      return { homeScore: outcome.homeScore, awayScore: outcome.awayScore };
    } catch (error: unknown) {
      await this.prisma.client.simulationJob.update({
        where: { id: jobRecord.id },
        data: {
          status: 'FAILED',
          finishedAt: new Date(),
          errorMessage: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }
  }
}
