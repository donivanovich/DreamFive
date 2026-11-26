import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  type OnModuleDestroy,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import {
  advanceSeasonForLeague,
  repriceLeagueMarket,
  simulateRoundForLeague,
  simulateScheduledMatchAndProgress,
  syncLeagueClockToRealTime,
} from '@dream5/database';
import {
  type AdvanceGameClockInput,
  type DevLeagueStatusDto,
  JOB_NAMES,
  QUEUE_NAMES,
  SOCKET_EVENTS,
  type SyncClockResponseDto,
} from '@dream5/shared';
import { type Queue, QueueEvents } from 'bullmq';

import { API_ENV } from '../../config/app-config.module.js';
import type { ApiEnv } from '../../config/env.schema.js';
import { PrismaService } from '../../database/prisma.service.js';
import { RealtimeService } from '../../realtime/realtime.service.js';
import { buildRedisConnectionOptions } from '../../redis/redis.module.js';

@Injectable()
export class DevToolsService implements OnModuleDestroy {
  private readonly queueEventsMap = new Map<string, QueueEvents>();

  constructor(
    @Inject(API_ENV) private readonly env: ApiEnv,
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    @InjectQueue(QUEUE_NAMES.simulation) private readonly simulationQueue: Queue,
    @InjectQueue(QUEUE_NAMES.market) private readonly marketQueue: Queue,
    @InjectQueue(QUEUE_NAMES.seasons) private readonly seasonsQueue: Queue,
  ) {}

  async onModuleDestroy(): Promise<void> {
    for (const qe of this.queueEventsMap.values()) {
      await qe.close();
    }
    this.queueEventsMap.clear();
  }

  private async getQueueEvents(queueName: string): Promise<QueueEvents> {
    let qe = this.queueEventsMap.get(queueName);
    if (!qe) {
      qe = new QueueEvents(queueName, {
        connection: { ...buildRedisConnectionOptions(this.env), maxRetriesPerRequest: null },
        prefix: this.env.QUEUE_PREFIX,
      });
      this.queueEventsMap.set(queueName, qe);
    }
    await qe.waitUntilReady();
    return qe;
  }

  private async enqueueWorkerJobAndWait(params: {
    readonly queue: Queue;
    readonly queueName: string;
    readonly jobName: string;
    readonly payload: Record<string, unknown>;
    readonly timeoutMs: number;
    readonly removeOnComplete: number;
  }): Promise<void> {
    const queueEvents = await this.getQueueEvents(params.queueName);
    const bullJob = await params.queue.add(params.jobName, params.payload, {
      removeOnComplete: params.removeOnComplete,
      removeOnFail: 20,
    });
    await bullJob.waitUntilFinished(queueEvents, params.timeoutMs);
  }

  private async hasActiveWorkers(queue: Queue): Promise<boolean> {
    try {
      const workers = await queue.getWorkers();
      return workers.length > 0;
    } catch {
      return false;
    }
  }

  async getLeagueStatus(leagueId: string): Promise<DevLeagueStatusDto> {
    const league = await this.prisma.client.league.findUnique({ where: { id: leagueId } });
    if (!league) {
      throw new NotFoundException('Liga no encontrada.');
    }

    const season = await this.prisma.client.season.findFirst({
      where: { leagueId, status: 'ACTIVE' },
      orderBy: { seasonNumber: 'desc' },
    });
    if (!season) {
      throw new NotFoundException('Temporada activa no encontrada.');
    }

    const [
      scheduledRemaining,
      completedCount,
      nextScheduledMatch,
      pendingJobsCount,
      recentJobs,
      workerOnline,
    ] = await Promise.all([
      this.prisma.client.match.count({
        where: { leagueId, seasonId: season.id, status: 'SCHEDULED' },
      }),
      this.prisma.client.match.count({
        where: { leagueId, seasonId: season.id, status: 'FINAL' },
      }),
      this.prisma.client.match.findFirst({
        where: { leagueId, seasonId: season.id, status: 'SCHEDULED' },
        orderBy: [{ roundNumber: 'asc' }, { scheduledAt: 'asc' }],
        select: {
          roundNumber: true,
          scheduledAt: true,
          homeTeam: { select: { code: true } },
          awayTeam: { select: { code: true } },
        },
      }),
      this.prisma.client.simulationJob.count({
        where: { leagueId, status: { in: ['QUEUED', 'RUNNING'] } },
      }),
      this.prisma.client.simulationJob.findMany({
        where: { leagueId },
        orderBy: { startedAt: 'desc' },
        take: 12,
      }),
      this.hasActiveWorkers(this.simulationQueue),
    ]);

    return {
      leagueId: league.id,
      leagueName: league.name,
      serverTimeIso: new Date().toISOString(),
      serverTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      gameClockAt: league.gameClockAt.toISOString(),
      isAccelerated: league.isAccelerated,
      workerOnline,
      season: {
        id: season.id,
        seasonNumber: season.seasonNumber,
        name: season.name,
        calendarYear: season.calendarYear,
        calendarMonth: season.calendarMonth,
        daysInMonth: season.daysInMonth,
        totalRounds: season.totalRounds,
        currentRoundNumber: season.currentRoundNumber,
        status: season.status,
        startedAt: season.startedAt.toISOString(),
        endedAt: season.endedAt?.toISOString() ?? null,
      },
      scheduledMatchesRemaining: scheduledRemaining,
      completedMatchesCount: completedCount,
      nextScheduledRound: nextScheduledMatch?.roundNumber ?? null,
      nextScheduledMatchAt: nextScheduledMatch?.scheduledAt.toISOString() ?? null,
      nextScheduledMatchLabel: nextScheduledMatch
        ? `${nextScheduledMatch.awayTeam.code} @ ${nextScheduledMatch.homeTeam.code}`
        : null,
      pendingJobsCount,
      recentJobs: recentJobs.map((j) => ({
        id: j.id,
        jobType: j.jobType,
        targetRound: j.targetRound,
        targetMatchId: j.targetMatchId,
        status: j.status,
        seed: j.seed,
        startedAt: j.startedAt.toISOString(),
        finishedAt: j.finishedAt?.toISOString() ?? null,
        errorMessage: j.errorMessage,
      })),
    };
  }

  async simulateRound(leagueId: string, requestedRound?: number) {
    const season = await this.prisma.client.season.findFirst({
      where: { leagueId, status: 'ACTIVE' },
      orderBy: { seasonNumber: 'desc' },
    });
    if (!season) {
      throw new NotFoundException('No hay temporada activa.');
    }

    let roundNumber = requestedRound;
    if (!roundNumber) {
      const nextScheduled = await this.prisma.client.match.findFirst({
        where: { leagueId, seasonId: season.id, status: 'SCHEDULED' },
        orderBy: [{ roundNumber: 'asc' }, { scheduledAt: 'asc' }],
        select: { roundNumber: true },
      });
      if (!nextScheduled) {
        throw new BadRequestException(
          'Todas las 58 jornadas de esta temporada ya han sido simuladas. Puedes cerrar e iniciar la siguiente temporada.',
        );
      }
      roundNumber = nextScheduled.roundNumber;
    }

    const jobRecord = await this.prisma.client.simulationJob.create({
      data: {
        leagueId,
        seasonId: season.id,
        jobType: JOB_NAMES.simulateRound,
        targetRound: roundNumber,
        status: 'QUEUED',
        seed: `manual:${leagueId}:s${String(season.seasonNumber)}:r${String(roundNumber)}`,
      },
    });

    if (await this.hasActiveWorkers(this.simulationQueue)) {
      await this.enqueueWorkerJobAndWait({
        queue: this.simulationQueue,
        queueName: QUEUE_NAMES.simulation,
        jobName: JOB_NAMES.simulateRound,
        payload: {
          leagueId,
          roundNumber,
          simJobId: jobRecord.id,
        },
        timeoutMs: 20_000,
        removeOnComplete: 50,
      });
      return { roundNumber, executedVia: 'bullmq-worker', jobId: jobRecord.id };
    }

    const res = await simulateRoundForLeague(this.prisma.client, { leagueId, roundNumber });
    await this.prisma.client.simulationJob.update({
      where: { id: jobRecord.id },
      data: { status: 'COMPLETED', finishedAt: new Date() },
    });
    this.realtime.emitLeagueEvent({
      leagueId,
      eventType: SOCKET_EVENTS.matchUpdated,
      roundNumber: res.roundNumber,
      timestamp: new Date().toISOString(),
    });
    this.realtime.emitLeagueEvent({
      leagueId,
      eventType: SOCKET_EVENTS.roundCompleted,
      roundNumber: res.roundNumber,
      timestamp: new Date().toISOString(),
    });
    this.realtime.emitLeagueEvent({
      leagueId,
      eventType: SOCKET_EVENTS.standingsUpdated,
      roundNumber: res.roundNumber,
      timestamp: new Date().toISOString(),
    });
    if (res.matchesSimulated > 0) {
      this.realtime.emitLeagueEvent({
        leagueId,
        eventType: SOCKET_EVENTS.marketUpdated,
        roundNumber: res.roundNumber,
        timestamp: new Date().toISOString(),
      });
      this.realtime.emitLeagueEvent({
        leagueId,
        eventType: SOCKET_EVENTS.transferUpdated,
        roundNumber: res.roundNumber,
        timestamp: new Date().toISOString(),
      });
      this.realtime.emitLeagueEvent({
        leagueId,
        eventType: SOCKET_EVENTS.mailUpdated,
        roundNumber: res.roundNumber,
        timestamp: new Date().toISOString(),
      });
    }
    if (res.seasonCompleted) {
      await advanceSeasonForLeague(this.prisma.client, {
        leagueId,
        expectedSeasonId: res.seasonId,
      });
      this.realtime.emitLeagueEvent({
        leagueId,
        eventType: SOCKET_EVENTS.seasonRollover,
        timestamp: new Date().toISOString(),
      });
      this.realtime.emitLeagueEvent({
        leagueId,
        eventType: SOCKET_EVENTS.mailUpdated,
        timestamp: new Date().toISOString(),
      });
    }
    return {
      roundNumber: res.roundNumber,
      matchesSimulated: res.matchesSimulated,
      executedVia: 'api-inline-fallback',
      jobId: jobRecord.id,
    };
  }

  async simulateSingleMatch(leagueId: string, callerTeamId: string, requestedMatchId?: string) {
    const season = await this.prisma.client.season.findFirst({
      where: { leagueId, status: 'ACTIVE' },
      orderBy: { seasonNumber: 'desc' },
    });
    if (!season) {
      throw new NotFoundException('No hay temporada activa.');
    }

    const targetMatch = requestedMatchId
      ? await this.prisma.client.match.findFirst({
          where: { id: requestedMatchId, leagueId },
        })
      : ((await this.prisma.client.match.findFirst({
          where: {
            leagueId,
            seasonId: season.id,
            status: 'SCHEDULED',
            OR: [{ homeTeamId: callerTeamId }, { awayTeamId: callerTeamId }],
          },
          orderBy: [{ roundNumber: 'asc' }, { scheduledAt: 'asc' }],
        })) ??
        (await this.prisma.client.match.findFirst({
          where: { leagueId, seasonId: season.id, status: 'SCHEDULED' },
          orderBy: [{ roundNumber: 'asc' }, { scheduledAt: 'asc' }],
        })));

    if (!targetMatch) {
      throw new BadRequestException('No quedan partidos pendientes en la temporada activa.');
    }

    const jobRecord = await this.prisma.client.simulationJob.create({
      data: {
        leagueId,
        seasonId: season.id,
        jobType: JOB_NAMES.simulateMatch,
        targetRound: targetMatch.roundNumber,
        targetMatchId: targetMatch.id,
        status: 'QUEUED',
        seed: targetMatch.seed,
      },
    });

    if (await this.hasActiveWorkers(this.simulationQueue)) {
      await this.enqueueWorkerJobAndWait({
        queue: this.simulationQueue,
        queueName: QUEUE_NAMES.simulation,
        jobName: JOB_NAMES.simulateMatch,
        payload: {
          leagueId,
          matchId: targetMatch.id,
          simJobId: jobRecord.id,
        },
        timeoutMs: 15_000,
        removeOnComplete: 50,
      });
      return {
        matchId: targetMatch.id,
        roundNumber: targetMatch.roundNumber,
        executedVia: 'bullmq-worker',
      };
    }

    const outcome = await simulateScheduledMatchAndProgress(this.prisma.client, {
      leagueId,
      matchId: targetMatch.id,
    });

    await this.prisma.client.simulationJob.update({
      where: { id: jobRecord.id },
      data: { status: 'COMPLETED', finishedAt: new Date() },
    });

    if (!outcome.alreadyCompleted) {
      const ts = new Date().toISOString();
      this.realtime.emitLeagueEvent({
        leagueId,
        eventType: SOCKET_EVENTS.matchUpdated,
        roundNumber: outcome.roundNumber,
        matchId: outcome.matchId,
        timestamp: ts,
      });
      this.realtime.emitLeagueEvent({
        leagueId,
        eventType: SOCKET_EVENTS.standingsUpdated,
        roundNumber: outcome.roundNumber,
        timestamp: ts,
      });
    }

    if (outcome.roundCompleted) {
      const ts = new Date().toISOString();
      this.realtime.emitLeagueEvent({
        leagueId,
        eventType: SOCKET_EVENTS.roundCompleted,
        roundNumber: outcome.roundNumber,
        timestamp: ts,
      });
      this.realtime.emitLeagueEvent({
        leagueId,
        eventType: SOCKET_EVENTS.marketUpdated,
        roundNumber: outcome.roundNumber,
        timestamp: ts,
      });
      this.realtime.emitLeagueEvent({
        leagueId,
        eventType: SOCKET_EVENTS.transferUpdated,
        roundNumber: outcome.roundNumber,
        timestamp: ts,
      });
      this.realtime.emitLeagueEvent({
        leagueId,
        eventType: SOCKET_EVENTS.mailUpdated,
        roundNumber: outcome.roundNumber,
        timestamp: ts,
      });
    }

    if (outcome.seasonCompleted) {
      await advanceSeasonForLeague(this.prisma.client, {
        leagueId,
        expectedSeasonId: outcome.seasonId,
      });
      const ts = new Date().toISOString();
      this.realtime.emitLeagueEvent({
        leagueId,
        eventType: SOCKET_EVENTS.seasonRollover,
        timestamp: ts,
      });
      this.realtime.emitLeagueEvent({
        leagueId,
        eventType: SOCKET_EVENTS.mailUpdated,
        timestamp: ts,
      });
    }
    return {
      matchId: outcome.matchId,
      roundNumber: outcome.roundNumber,
      homeScore: outcome.homeScore,
      awayScore: outcome.awayScore,
      executedVia: 'api-inline-fallback',
    };
  }

  async advanceClockAndSimulate(leagueId: string, input: AdvanceGameClockInput) {
    const league = await this.prisma.client.league.findUnique({ where: { id: leagueId } });
    if (!league) {
      throw new NotFoundException('Liga no encontrada.');
    }
    const season = await this.prisma.client.season.findFirst({
      where: { leagueId, status: 'ACTIVE' },
      orderBy: { seasonNumber: 'desc' },
    });
    if (!season) {
      throw new NotFoundException('Temporada activa no encontrada.');
    }

    const newClock = new Date(league.gameClockAt.getTime() + input.hours * 3600_000);
    await this.prisma.client.league.update({
      where: { id: leagueId },
      data: { gameClockAt: newClock, isAccelerated: true },
    });

    this.realtime.emitLeagueEvent({
      leagueId,
      eventType: SOCKET_EVENTS.clockUpdated,
      timestamp: newClock.toISOString(),
    });

    const dueRounds = await this.prisma.client.match.findMany({
      where: {
        leagueId,
        seasonId: season.id,
        status: 'SCHEDULED',
        scheduledAt: { lte: newClock },
      },
      distinct: ['roundNumber'],
      select: { roundNumber: true },
      orderBy: { roundNumber: 'asc' },
      take: 12,
    });

    const simulatedRounds: number[] = [];
    for (const r of dueRounds) {
      await this.simulateRound(leagueId, r.roundNumber);
      simulatedRounds.push(r.roundNumber);
    }

    return {
      newGameClockAt: newClock.toISOString(),
      simulatedRounds,
    };
  }

  async repriceMarket(leagueId: string) {
    const jobRecord = await this.prisma.client.simulationJob.create({
      data: {
        leagueId,
        jobType: JOB_NAMES.repriceLeagueMarket,
        status: 'QUEUED',
        seed: `market:${leagueId}:${String(Date.now())}`,
      },
    });

    if (await this.hasActiveWorkers(this.marketQueue)) {
      await this.enqueueWorkerJobAndWait({
        queue: this.marketQueue,
        queueName: QUEUE_NAMES.market,
        jobName: JOB_NAMES.repriceLeagueMarket,
        payload: {
          leagueId,
          reason: 'Actualización manual desde panel de simulación',
          simJobId: jobRecord.id,
        },
        timeoutMs: 15_000,
        removeOnComplete: 30,
      });
      return { executedVia: 'bullmq-worker', jobId: jobRecord.id };
    }

    const res = await repriceLeagueMarket(this.prisma.client, {
      leagueId,
      reason: 'Actualización manual desde panel de simulación',
    });
    await this.prisma.client.simulationJob.update({
      where: { id: jobRecord.id },
      data: { status: 'COMPLETED', finishedAt: new Date() },
    });
    this.realtime.emitLeagueEvent({
      leagueId,
      eventType: SOCKET_EVENTS.marketUpdated,
      timestamp: new Date().toISOString(),
    });
    return {
      updatedPlayersCount: res.updatedPlayersCount,
      executedVia: 'api-inline-fallback',
      jobId: jobRecord.id,
    };
  }

  async finishSeasonRollover(leagueId: string, simulateRemaining = false) {
    if (simulateRemaining) {
      const remaining = await this.prisma.client.match.findMany({
        where: { leagueId, status: 'SCHEDULED' },
        distinct: ['roundNumber'],
        orderBy: { roundNumber: 'asc' },
        select: { roundNumber: true },
        take: 15,
      });
      for (const r of remaining) {
        await simulateRoundForLeague(this.prisma.client, {
          leagueId,
          roundNumber: r.roundNumber,
        });
      }
    }

    const jobRecord = await this.prisma.client.simulationJob.create({
      data: {
        leagueId,
        jobType: JOB_NAMES.seasonRollover,
        status: 'QUEUED',
        seed: `season-rollover:${leagueId}:${String(Date.now())}`,
      },
    });

    if (await this.hasActiveWorkers(this.seasonsQueue)) {
      await this.enqueueWorkerJobAndWait({
        queue: this.seasonsQueue,
        queueName: QUEUE_NAMES.seasons,
        jobName: JOB_NAMES.seasonRollover,
        payload: {
          leagueId,
          simJobId: jobRecord.id,
        },
        timeoutMs: 30_000,
        removeOnComplete: 20,
      });
      return { executedVia: 'bullmq-worker', jobId: jobRecord.id };
    }

    const res = await advanceSeasonForLeague(this.prisma.client, { leagueId });
    await this.prisma.client.simulationJob.update({
      where: { id: jobRecord.id },
      data: { seasonId: res.newSeasonId, status: 'COMPLETED', finishedAt: new Date() },
    });
    this.realtime.emitLeagueEvent({
      leagueId,
      eventType: SOCKET_EVENTS.seasonRollover,
      timestamp: new Date().toISOString(),
    });
    this.realtime.emitLeagueEvent({
      leagueId,
      eventType: SOCKET_EVENTS.mailUpdated,
      timestamp: new Date().toISOString(),
    });
    return { ...res, executedVia: 'api-inline-fallback', jobId: jobRecord.id };
  }

  async syncClockToRealTime(leagueId: string): Promise<SyncClockResponseDto> {
    const res = await syncLeagueClockToRealTime(this.prisma.client, { leagueId });
    const now = new Date();
    await this.prisma.client.simulationJob.create({
      data: {
        leagueId,
        jobType: 'sync-clock',
        targetRound: res.currentRoundNumber,
        status: 'COMPLETED',
        seed: `sync-clock:${leagueId}:${String(now.getTime())}`,
        finishedAt: now,
      },
    });

    const ts = now.toISOString();
    this.realtime.emitLeagueEvent({
      leagueId,
      eventType: SOCKET_EVENTS.clockUpdated,
      timestamp: res.newGameClockAt,
    });
    this.realtime.emitLeagueEvent({
      leagueId,
      eventType: SOCKET_EVENTS.roundCompleted,
      roundNumber: res.currentRoundNumber,
      timestamp: ts,
    });
    this.realtime.emitLeagueEvent({
      leagueId,
      eventType: SOCKET_EVENTS.standingsUpdated,
      roundNumber: res.currentRoundNumber,
      timestamp: ts,
    });
    this.realtime.emitLeagueEvent({
      leagueId,
      eventType: SOCKET_EVENTS.marketUpdated,
      roundNumber: res.currentRoundNumber,
      timestamp: ts,
    });
    this.realtime.emitLeagueEvent({
      leagueId,
      eventType: SOCKET_EVENTS.transferUpdated,
      roundNumber: res.currentRoundNumber,
      timestamp: ts,
    });
    this.realtime.emitLeagueEvent({
      leagueId,
      eventType: SOCKET_EVENTS.mailUpdated,
      roundNumber: res.currentRoundNumber,
      timestamp: ts,
    });

    return res;
  }
}
