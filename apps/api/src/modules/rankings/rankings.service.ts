import { Injectable, NotFoundException } from '@nestjs/common';
import type { StandingEntryDto } from '@dream5/shared';

import { PrismaService } from '../../database/prisma.service.js';

@Injectable()
export class RankingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getRankings(
    leagueId: string,
    callerTeamId: string,
  ): Promise<{
    readonly seasonNumber: number;
    readonly seasonName: string;
    readonly currentRoundNumber: number;
    readonly standings: readonly StandingEntryDto[];
    readonly recentUserScores: readonly {
      readonly roundNumber: number;
      readonly totalFp: number;
      readonly breakdownJson: unknown;
    }[];
  }> {
    const season = await this.prisma.client.season.findFirst({
      where: { leagueId, status: 'ACTIVE' },
      orderBy: { seasonNumber: 'desc' },
    });
    if (!season) {
      throw new NotFoundException('Temporada activa no encontrada.');
    }

    const [standingRows, recentScores] = await Promise.all([
      this.prisma.client.standing.findMany({
        where: { leagueId, seasonId: season.id },
        include: {
          team: {
            include: {
              member: {
                include: { user: { include: { profile: true } } },
              },
            },
          },
        },
        orderBy: [{ rank: 'asc' }, { fantasyPoints: 'desc' }],
      }),
      this.prisma.client.fantasyScore.findMany({
        where: { leagueId, seasonId: season.id, leagueTeamId: callerTeamId },
        orderBy: { roundNumber: 'desc' },
        take: 10,
      }),
    ]);

    return {
      seasonNumber: season.seasonNumber,
      seasonName: season.name,
      currentRoundNumber: season.currentRoundNumber,
      standings: standingRows.map((s) => ({
        rank: s.rank,
        leagueTeamId: s.leagueTeamId,
        teamName: s.team.name,
        teamCode: s.team.code,
        isCpuControlled: s.team.isCpuControlled,
        managerUsername: s.team.member?.user.profile?.username ?? null,
        managerTag: s.team.member?.user.profile?.tag ?? null,
        managerAvatarUrl: s.team.member?.user.profile?.avatarUrl ?? null,
        isUserTeam: s.leagueTeamId === callerTeamId,
        fantasyPoints: s.fantasyPoints,
        lastRoundFp: s.lastRoundFp,
        avgFp: s.avgFp,
        wins: s.wins,
        losses: s.losses,
        lastFive: s.lastFiveResults.map((r) => (r === 'W' ? 'W' : 'L')),
      })),
      recentUserScores: recentScores.map((r) => ({
        roundNumber: r.roundNumber,
        totalFp: r.totalFp,
        breakdownJson: r.breakdownJson,
      })),
    };
  }
}
