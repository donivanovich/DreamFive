import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@dream5/database';
import type { MatchDetailDto, MatchFixtureDto, MatchStatus } from '@dream5/shared';

import { PrismaService } from '../../database/prisma.service.js';

@Injectable()
export class MatchesService {
  constructor(private readonly prisma: PrismaService) {}

  async listMatches(
    leagueId: string,
    filters: {
      readonly roundNumber?: number;
      readonly teamId?: string;
      readonly status?: MatchStatus;
      readonly seasonId?: string;
    },
  ): Promise<{
    readonly seasonNumber: number;
    readonly currentRoundNumber: number;
    readonly totalRounds: number;
    readonly items: readonly MatchFixtureDto[];
  }> {
    const season = filters.seasonId
      ? await this.prisma.client.season.findFirst({
          where: { id: filters.seasonId, leagueId },
        })
      : await this.prisma.client.season.findFirst({
          where: { leagueId, status: 'ACTIVE' },
          orderBy: { seasonNumber: 'desc' },
        });

    if (!season) {
      throw new NotFoundException('Temporada no encontrada en esta liga.');
    }

    const where: Prisma.MatchWhereInput = {
      leagueId,
      seasonId: season.id,
      ...(filters.roundNumber ? { roundNumber: filters.roundNumber } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.teamId
        ? {
            OR: [{ homeTeamId: filters.teamId }, { awayTeamId: filters.teamId }],
          }
        : {}),
    };

    const rows = await this.prisma.client.match.findMany({
      where,
      include: {
        homeTeam: { select: { name: true, code: true } },
        awayTeam: { select: { name: true, code: true } },
      },
      orderBy: [{ roundNumber: 'asc' }, { scheduledAt: 'asc' }],
    });

    return {
      seasonNumber: season.seasonNumber,
      currentRoundNumber: season.currentRoundNumber,
      totalRounds: season.totalRounds,
      items: rows.map((m) => ({
        id: m.id,
        roundNumber: m.roundNumber,
        scheduledAt: m.scheduledAt.toISOString(),
        simulatedAt: m.simulatedAt?.toISOString() ?? null,
        status: m.status,
        homeTeamId: m.homeTeamId,
        homeTeamName: m.homeTeam.name,
        homeTeamCode: m.homeTeam.code,
        homeScore: m.homeScore,
        awayTeamId: m.awayTeamId,
        awayTeamName: m.awayTeam.name,
        awayTeamCode: m.awayTeam.code,
        awayScore: m.awayScore,
        overtimeCount: m.overtimeCount,
        winRewardMillions: m.winRewardMillions,
      })),
    };
  }

  async getMatchDetail(leagueId: string, matchId: string): Promise<MatchDetailDto> {
    const match = await this.prisma.client.match.findFirst({
      where: { id: matchId, leagueId },
      include: {
        homeTeam: { select: { name: true, code: true } },
        awayTeam: { select: { name: true, code: true } },
        teamStats: {
          include: { team: { select: { name: true, code: true } } },
        },
        playerStats: {
          include: {
            player: { select: { name: true, position: true } },
            team: { select: { code: true } },
          },
          orderBy: [{ wasStarter: 'desc' }, { fantasyPoints: 'desc' }],
        },
        events: {
          orderBy: [{ quarter: 'asc' }, { id: 'asc' }],
        },
      },
    });

    if (!match) {
      throw new NotFoundException('Partido no encontrado en esta liga.');
    }

    return {
      match: {
        id: match.id,
        roundNumber: match.roundNumber,
        scheduledAt: match.scheduledAt.toISOString(),
        simulatedAt: match.simulatedAt?.toISOString() ?? null,
        status: match.status,
        homeTeamId: match.homeTeamId,
        homeTeamName: match.homeTeam.name,
        homeTeamCode: match.homeTeam.code,
        homeScore: match.homeScore,
        awayTeamId: match.awayTeamId,
        awayTeamName: match.awayTeam.name,
        awayTeamCode: match.awayTeam.code,
        awayScore: match.awayScore,
        overtimeCount: match.overtimeCount,
        winRewardMillions: match.winRewardMillions,
      },
      teamStats: match.teamStats.map((ts) => ({
        leagueTeamId: ts.leagueTeamId,
        teamName: ts.team.name,
        teamCode: ts.team.code,
        pts: ts.pts,
        reb: ts.reb,
        ast: ts.ast,
        stl: ts.stl,
        blk: ts.blk,
        tov: ts.tov,
        pf: ts.pf,
      })),
      playerStats: match.playerStats.map((ps) => ({
        playerInstanceId: ps.playerInstanceId,
        playerName: ps.player.name,
        position: ps.player.position,
        leagueTeamId: ps.leagueTeamId,
        teamCode: ps.team.code,
        minutes: ps.minutes,
        pts: ps.pts,
        reb: ps.reb,
        ast: ps.ast,
        stl: ps.stl,
        blk: ps.blk,
        tov: ps.tov,
        pf: ps.pf,
        fantasyPoints: ps.fantasyPoints,
        wasStarter: ps.wasStarter,
        ejected: ps.ejected,
        injured: ps.injured,
      })),
      events: match.events.map((ev) => ({
        id: ev.id,
        quarter: ev.quarter,
        clockLabel: ev.clockLabel,
        eventType: ev.eventType,
        description: ev.description,
      })),
    };
  }
}
