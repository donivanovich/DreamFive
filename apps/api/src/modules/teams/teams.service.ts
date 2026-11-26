import { Injectable, NotFoundException } from '@nestjs/common';
import type { PlayerInstanceDto } from '@dreamfive/shared';

import { toPlayerInstanceDto } from '../../common/dto-mappers.js';
import { PrismaService } from '../../database/prisma.service.js';

export interface LeagueTeamSummaryDto {
  readonly id: string;
  readonly name: string;
  readonly shortName: string;
  readonly code: string;
  readonly budgetMillions: number;
  readonly isCpuControlled: boolean;
  readonly managerUsername: string | null;
  readonly managerTag: string | null;
  readonly managerAvatarUrl: string | null;
  readonly isUserTeam: boolean;
  readonly rank: number;
  readonly totalFantasyPoints: number;
  readonly wins: number;
  readonly losses: number;
  readonly rosterCount: number;
}

export interface LeagueTeamDetailDto {
  readonly team: LeagueTeamSummaryDto;
  readonly roster: readonly PlayerInstanceDto[];
}

@Injectable()
export class TeamsService {
  constructor(private readonly prisma: PrismaService) {}

  async listLeagueTeams(
    leagueId: string,
    callerTeamId: string,
  ): Promise<readonly LeagueTeamSummaryDto[]> {
    const teams = await this.prisma.client.leagueTeam.findMany({
      where: { leagueId },
      include: {
        member: {
          include: { user: { include: { profile: true } } },
        },
        _count: { select: { rosterSlots: true } },
      },
      orderBy: [{ rank: 'asc' }, { code: 'asc' }],
    });

    return teams.map((t) => ({
      id: t.id,
      name: t.name,
      shortName: t.shortName,
      code: t.code,
      budgetMillions: t.budgetMillions,
      isCpuControlled: t.isCpuControlled,
      managerUsername: t.member?.user.profile?.username ?? null,
      managerTag: t.member?.user.profile?.tag ?? null,
      managerAvatarUrl: t.member?.user.profile?.avatarUrl ?? null,
      isUserTeam: t.id === callerTeamId,
      rank: t.rank,
      totalFantasyPoints: t.totalFantasyPoints,
      wins: t.wins,
      losses: t.losses,
      rosterCount: t._count.rosterSlots,
    }));
  }

  async getTeamDetail(
    leagueId: string,
    teamId: string,
    callerTeamId: string,
  ): Promise<LeagueTeamDetailDto> {
    const team = await this.prisma.client.leagueTeam.findFirst({
      where: { id: teamId, leagueId },
      include: {
        member: {
          include: { user: { include: { profile: true } } },
        },
        _count: { select: { rosterSlots: true } },
      },
    });
    if (!team) {
      throw new NotFoundException('Franquicia no encontrada en esta liga.');
    }

    const players = await this.prisma.client.playerInstance.findMany({
      where: { leagueId, currentTeamId: team.id, isRetired: false },
      include: { currentTeam: { select: { name: true, code: true } } },
      orderBy: [{ overallRating: 'desc' }, { name: 'asc' }],
    });

    return {
      team: {
        id: team.id,
        name: team.name,
        shortName: team.shortName,
        code: team.code,
        budgetMillions: team.budgetMillions,
        isCpuControlled: team.isCpuControlled,
        managerUsername: team.member?.user.profile?.username ?? null,
        managerTag: team.member?.user.profile?.tag ?? null,
        managerAvatarUrl: team.member?.user.profile?.avatarUrl ?? null,
        isUserTeam: team.id === callerTeamId,
        rank: team.rank,
        totalFantasyPoints: team.totalFantasyPoints,
        wins: team.wins,
        losses: team.losses,
        rosterCount: team._count.rosterSlots,
      },
      roster: players.map(toPlayerInstanceDto),
    };
  }
}
