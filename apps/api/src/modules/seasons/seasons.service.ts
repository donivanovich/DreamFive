import { Injectable } from '@nestjs/common';
import { advanceSeasonForLeague } from '@dream5/database';
import { type SeasonSummaryDto, SOCKET_EVENTS } from '@dream5/shared';

import { PrismaService } from '../../database/prisma.service.js';
import { RealtimeService } from '../../realtime/realtime.service.js';

@Injectable()
export class SeasonsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  async listSeasons(leagueId: string): Promise<readonly SeasonSummaryDto[]> {
    const seasons = await this.prisma.client.season.findMany({
      where: { leagueId },
      orderBy: { seasonNumber: 'desc' },
    });

    return seasons.map((s) => ({
      id: s.id,
      seasonNumber: s.seasonNumber,
      name: s.name,
      calendarYear: s.calendarYear,
      calendarMonth: s.calendarMonth,
      daysInMonth: s.daysInMonth,
      totalRounds: s.totalRounds,
      currentRoundNumber: s.currentRoundNumber,
      status: s.status,
      startedAt: s.startedAt.toISOString(),
      endedAt: s.endedAt?.toISOString() ?? null,
    }));
  }

  async rollOverSeason(leagueId: string) {
    const res = await advanceSeasonForLeague(this.prisma.client, { leagueId });
    this.realtime.emitLeagueEvent({
      leagueId,
      eventType: SOCKET_EVENTS.seasonRollover,
      timestamp: new Date().toISOString(),
    });
    return res;
  }
}
