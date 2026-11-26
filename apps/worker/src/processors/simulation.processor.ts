import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import {
  expirePendingTransferOffers,
  simulateRoundForLeague,
  simulateScheduledMatchAndProgress,
} from '@dream5/database';
import { JOB_NAMES, QUEUE_NAMES, SOCKET_EVENTS } from '@dream5/shared';
import type { Job, Queue } from 'bullmq';
import type { Redis } from 'ioredis';

import { WorkerPrismaService } from '../database/worker-prisma.service.js';
import { RealtimePublisherService, WORKER_REDIS_CLIENT } from '../redis/worker-redis.module.js';
import type {
  SeasonRolloverJobData,
  SimulateMatchJobData,
  SimulateRoundJobData,
} from './job-payloads.js';
import { computeNextLeagueClock } from './simulation-clock.js';

@Processor(QUEUE_NAMES.simulation, { concurrency: 1 })
export class SimulationProcessor extends WorkerHost {
  private readonly logger = new Logger(SimulationProcessor.name);
  private readonly wallClockByLeague = new Map<string, number>();

  constructor(
    private readonly prisma: WorkerPrismaService,
    private readonly realtime: RealtimePublisherService,
    @InjectQueue(QUEUE_NAMES.simulation) private readonly simulationQueue: Queue,
    @InjectQueue(QUEUE_NAMES.seasons) private readonly seasonsQueue: Queue,
    @Inject(WORKER_REDIS_CLIENT) private readonly redis: Redis,
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

  private async readPreviousWallMs(leagueId: string): Promise<number | undefined> {
    const cached = this.wallClockByLeague.get(leagueId);
    if (cached !== undefined) {
      return cached;
    }
    try {
      if (this.redis.status === 'wait') {
        await this.redis.connect();
      }
      const raw = await this.redis.get(`dream5:worker:clock-wall:${leagueId}`);
      if (!raw) {
        return undefined;
      }
      const parsed = Number.parseInt(raw, 10);
      return Number.isFinite(parsed) ? parsed : undefined;
    } catch {
      return undefined;
    }
  }

  private async persistWallMs(leagueId: string, nowMs: number): Promise<void> {
    this.wallClockByLeague.set(leagueId, nowMs);
    try {
      if (this.redis.status === 'wait') {
        await this.redis.connect();
      }
      await this.redis.set(
        `dream5:worker:clock-wall:${leagueId}`,
        String(nowMs),
        'EX',
        7 * 24 * 3600,
      );
    } catch {
      // Mantiene seguimiento en memoria si Redis no aceptó el comando puntual.
    }
  }

  private async publishRoundClosedEvents(leagueId: string, roundNumber: number): Promise<void> {
    const ts = new Date().toISOString();
    await Promise.all([
      this.realtime.publishLeagueEvent({
        leagueId,
        eventType: SOCKET_EVENTS.roundCompleted,
        roundNumber,
        timestamp: ts,
      }),
      this.realtime.publishLeagueEvent({
        leagueId,
        eventType: SOCKET_EVENTS.marketUpdated,
        roundNumber,
        timestamp: ts,
      }),
      this.realtime.publishLeagueEvent({
        leagueId,
        eventType: SOCKET_EVENTS.transferUpdated,
        roundNumber,
        timestamp: ts,
      }),
      this.realtime.publishLeagueEvent({
        leagueId,
        eventType: SOCKET_EVENTS.mailUpdated,
        roundNumber,
        timestamp: ts,
      }),
    ]);
  }

  private async enqueueAutoSeasonRollover(leagueId: string, seasonId: string): Promise<void> {
    await this.seasonsQueue.add(
      JOB_NAMES.seasonRollover,
      {
        leagueId,
        expectedSeasonId: seasonId,
      } satisfies SeasonRolloverJobData,
      {
        jobId: `rollover_${leagueId}_${seasonId}`,
        removeOnComplete: true,
        removeOnFail: { count: 10 },
      },
    );
  }

  private async handleSchedulerTick(): Promise<{ readonly scheduledMatchesQueued: number }> {
    const nowMs = Date.now();
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

    let scheduledMatchesQueued = 0;

    for (const league of activeLeagues) {
      const activeSeason = league.seasons[0];
      if (!activeSeason) {
        continue;
      }

      const prevWallMs = await this.readPreviousWallMs(league.id);
      const nextGameClock = computeNextLeagueClock({
        currentGameClockAt: league.gameClockAt,
        seasonStartedAt: activeSeason.startedAt,
        isAccelerated: league.isAccelerated,
        ...(prevWallMs !== undefined ? { prevWallMs } : {}),
        nowMs,
      });
      await this.persistWallMs(league.id, nowMs);

      if (Math.abs(nextGameClock.getTime() - league.gameClockAt.getTime()) >= 500) {
        await this.prisma.client.league.update({
          where: { id: league.id },
          data: { gameClockAt: nextGameClock },
        });
        await this.realtime.publishLeagueEvent({
          leagueId: league.id,
          eventType: SOCKET_EVENTS.clockUpdated,
          timestamp: nextGameClock.toISOString(),
        });
      }

      const dueMatches = await this.prisma.client.match.findMany({
        where: {
          leagueId: league.id,
          seasonId: activeSeason.id,
          status: 'SCHEDULED',
          scheduledAt: { lte: nextGameClock },
        },
        select: { id: true },
        orderBy: [{ roundNumber: 'asc' }, { scheduledAt: 'asc' }],
        take: 45,
      });

      for (const m of dueMatches) {
        await this.simulationQueue.add(
          JOB_NAMES.simulateMatch,
          {
            leagueId: league.id,
            matchId: m.id,
          } satisfies SimulateMatchJobData,
          {
            jobId: `sim_match_${m.id}`,
            removeOnComplete: true,
            removeOnFail: { count: 20 },
          },
        );
        scheduledMatchesQueued += 1;
      }

      const expiredOffersPending = await this.prisma.client.transferOffer.count({
        where: {
          leagueId: league.id,
          status: 'PENDING',
          expiresAt: { lte: new Date(nowMs) },
        },
      });
      if (expiredOffersPending > 0) {
        const { expiredCount } = await expirePendingTransferOffers(this.prisma.client, {
          leagueId: league.id,
          asOf: new Date(nowMs),
        });
        if (expiredCount > 0) {
          await this.realtime.publishLeagueEvent({
            leagueId: league.id,
            eventType: SOCKET_EVENTS.transferUpdated,
            timestamp: new Date().toISOString(),
          });
        }
      }
    }

    return { scheduledMatchesQueued };
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

      const ts = new Date().toISOString();
      await Promise.all([
        this.realtime.publishLeagueEvent({
          leagueId: data.leagueId,
          eventType: SOCKET_EVENTS.matchUpdated,
          roundNumber: result.roundNumber,
          timestamp: ts,
        }),
        this.realtime.publishLeagueEvent({
          leagueId: data.leagueId,
          eventType: SOCKET_EVENTS.standingsUpdated,
          roundNumber: result.roundNumber,
          timestamp: ts,
        }),
      ]);

      if (result.matchesSimulated > 0) {
        await this.publishRoundClosedEvents(data.leagueId, result.roundNumber);
      }

      if (result.seasonCompleted) {
        await this.enqueueAutoSeasonRollover(data.leagueId, result.seasonId);
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
      const outcome = await simulateScheduledMatchAndProgress(this.prisma.client, {
        leagueId: data.leagueId,
        matchId: data.matchId,
      });

      await this.prisma.client.simulationJob.update({
        where: { id: jobRecord.id },
        data: {
          seasonId: outcome.seasonId,
          targetRound: outcome.roundNumber,
          status: 'COMPLETED',
          finishedAt: new Date(),
        },
      });

      if (!outcome.alreadyCompleted) {
        const ts = new Date().toISOString();
        await Promise.all([
          this.realtime.publishLeagueEvent({
            leagueId: data.leagueId,
            eventType: SOCKET_EVENTS.matchUpdated,
            roundNumber: outcome.roundNumber,
            matchId: outcome.matchId,
            timestamp: ts,
          }),
          this.realtime.publishLeagueEvent({
            leagueId: data.leagueId,
            eventType: SOCKET_EVENTS.standingsUpdated,
            roundNumber: outcome.roundNumber,
            timestamp: ts,
          }),
        ]);
      }

      if (outcome.roundCompleted) {
        await this.publishRoundClosedEvents(data.leagueId, outcome.roundNumber);
      }

      if (outcome.seasonCompleted) {
        await this.enqueueAutoSeasonRollover(data.leagueId, outcome.seasonId);
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
