import { Injectable } from '@nestjs/common';

import { toPlayerInstanceDto } from '../../common/dto-mappers.js';
import { PrismaService } from '../../database/prisma.service.js';

@Injectable()
export class StatisticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getLeagueStatistics(leagueId: string) {
    const season = await this.prisma.client.season.findFirst({
      where: { leagueId, status: 'ACTIVE' },
      orderBy: { seasonNumber: 'desc' },
    });

    const [
      topFantasyRows,
      topScorerRows,
      topRebounderRows,
      topPlaymakerRows,
      unavailablePlayers,
      completedMatchesCount,
      scheduledMatchesCount,
    ] = await Promise.all([
      this.prisma.client.playerInstance.findMany({
        where: { leagueId, isRetired: false },
        include: { currentTeam: { select: { name: true, code: true } } },
        orderBy: [{ seasonFantasyPoints: 'desc' }, { overallRating: 'desc' }],
        take: 15,
      }),
      this.prisma.client.playerInstance.findMany({
        where: { leagueId, isRetired: false },
        include: { currentTeam: { select: { name: true, code: true } } },
        orderBy: [{ seasonPtsAvg: 'desc' }, { overallRating: 'desc' }],
        take: 10,
      }),
      this.prisma.client.playerInstance.findMany({
        where: { leagueId, isRetired: false },
        include: { currentTeam: { select: { name: true, code: true } } },
        orderBy: [{ seasonRebAvg: 'desc' }, { overallRating: 'desc' }],
        take: 10,
      }),
      this.prisma.client.playerInstance.findMany({
        where: { leagueId, isRetired: false },
        include: { currentTeam: { select: { name: true, code: true } } },
        orderBy: [{ seasonAstAvg: 'desc' }, { overallRating: 'desc' }],
        take: 10,
      }),
      this.prisma.client.playerInstance.findMany({
        where: {
          leagueId,
          isRetired: false,
          status: { in: ['INJURED', 'SUSPENDED', 'QUESTIONABLE'] },
        },
        include: { currentTeam: { select: { name: true, code: true } } },
        orderBy: [{ gamesOutRemaining: 'desc' }, { overallRating: 'desc' }],
        take: 30,
      }),
      season
        ? this.prisma.client.match.count({
            where: { leagueId, seasonId: season.id, status: 'FINAL' },
          })
        : Promise.resolve(0),
      season
        ? this.prisma.client.match.count({
            where: { leagueId, seasonId: season.id, status: 'SCHEDULED' },
          })
        : Promise.resolve(0),
    ]);

    return {
      summary: {
        currentRoundNumber: season?.currentRoundNumber ?? 0,
        totalRounds: season?.totalRounds ?? 58,
        completedMatchesCount,
        scheduledMatchesCount,
        unavailableCount: unavailablePlayers.length,
      },
      topFantasy: topFantasyRows.map(toPlayerInstanceDto),
      topScorers: topScorerRows.map(toPlayerInstanceDto),
      topRebounders: topRebounderRows.map(toPlayerInstanceDto),
      topPlaymakers: topPlaymakerRows.map(toPlayerInstanceDto),
      medicalReport: unavailablePlayers.map(toPlayerInstanceDto),
    };
  }
}
