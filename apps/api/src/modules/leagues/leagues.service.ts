import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { instantiateLeague, Prisma } from '@dream5/database';
import type {
  CreateLeagueInput,
  LeagueRole,
  LeagueSummaryDto,
  SeasonSummaryDto,
} from '@dream5/shared';

import { PrismaService } from '../../database/prisma.service.js';

export interface LeagueParticipantDto {
  readonly userId: string;
  readonly username: string;
  readonly tag: string;
  readonly initials: string;
  readonly avatarUrl: string | null;
  readonly role: LeagueRole;
  readonly leagueTeamId: string;
  readonly teamName: string;
  readonly teamCode: string;
  readonly rank: number;
  readonly fantasyPoints: number;
  readonly wins: number;
  readonly losses: number;
}

export interface LeagueDetailDto {
  readonly league: LeagueSummaryDto;
  readonly season: SeasonSummaryDto;
  readonly members: readonly LeagueParticipantDto[];
}

@Injectable()
export class LeaguesService {
  constructor(private readonly prisma: PrismaService) {}

  async listUserLeagues(userId: string): Promise<readonly LeagueSummaryDto[]> {
    const memberships = await this.prisma.client.leagueMember.findMany({
      where: { userId },
      include: {
        team: true,
        league: {
          include: {
            seasons: {
              orderBy: { seasonNumber: 'desc' },
              take: 1,
            },
            _count: {
              select: { members: true },
            },
          },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });

    const summaries: LeagueSummaryDto[] = [];
    for (const m of memberships) {
      const season = m.league.seasons[0];
      if (!season) {
        continue;
      }
      const standing = await this.prisma.client.standing.findUnique({
        where: {
          leagueId_seasonId_leagueTeamId: {
            leagueId: m.leagueId,
            seasonId: season.id,
            leagueTeamId: m.leagueTeamId,
          },
        },
      });

      summaries.push({
        id: m.league.id,
        name: m.league.name,
        status: m.league.status,
        marketMode: m.league.marketMode,
        userRole: m.role,
        participantsCount: m.league._count.members,
        maxParticipants: m.league.maxParticipants,
        seasonNumber: season.seasonNumber,
        seasonName: season.name,
        currentRoundNumber: season.currentRoundNumber,
        totalRounds: season.totalRounds,
        gameClockAt: m.league.gameClockAt.toISOString(),
        userTeamId: m.team.id,
        userTeamName: m.team.name,
        userTeamCode: m.team.code,
        userRank: standing?.rank ?? m.team.rank,
        userTotalFp: standing?.fantasyPoints ?? m.team.totalFantasyPoints,
        userLastRoundFp: standing?.lastRoundFp ?? 0,
        userAvgFp: standing?.avgFp ?? 0,
        userBudgetMillions: m.team.budgetMillions,
      });
    }

    return summaries;
  }

  async createLeague(
    userId: string,
    input: CreateLeagueInput,
  ): Promise<{
    readonly leagueId: string;
    readonly assignedTeamId: string;
    readonly assignedTeamCode: string;
    readonly summary: LeagueSummaryDto;
  }> {
    const existingPresidency = await this.prisma.client.league.findFirst({
      where: { presidentUserId: userId, status: 'ACTIVE' },
      select: { id: true, name: true },
    });

    if (existingPresidency) {
      throw new ConflictException(
        `Solo puedes ser presidente de una liga activa a la vez (actualmente presides "${existingPresidency.name}").`,
      );
    }

    try {
      const created = await instantiateLeague(this.prisma.client, {
        name: input.name.trim(),
        presidentUserId: userId,
        marketMode: input.marketMode,
      });

      const list = await this.listUserLeagues(userId);
      const summary = list.find((l) => l.id === created.leagueId);
      if (!summary) {
        throw new Error('No se pudo recuperar el resumen de la liga recién creada.');
      }

      return {
        leagueId: created.leagueId,
        assignedTeamId: created.assignedTeamId,
        assignedTeamCode: created.assignedTeamCode,
        summary,
      };
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Ya eres presidente de otra liga activa.');
      }
      throw error;
    }
  }

  async getLeagueDetail(leagueId: string, userId: string): Promise<LeagueDetailDto> {
    const summaries = await this.listUserLeagues(userId);
    const leagueSummary = summaries.find((l) => l.id === leagueId);
    if (!leagueSummary) {
      throw new NotFoundException('Liga no encontrada o sin acceso.');
    }

    const activeSeason = await this.prisma.client.season.findFirst({
      where: { leagueId },
      orderBy: { seasonNumber: 'desc' },
    });
    if (!activeSeason) {
      throw new NotFoundException('Temporada activa no encontrada.');
    }

    const members = await this.prisma.client.leagueMember.findMany({
      where: { leagueId },
      include: {
        user: { include: { profile: true } },
        team: true,
      },
      orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
    });

    const seasonDto: SeasonSummaryDto = {
      id: activeSeason.id,
      seasonNumber: activeSeason.seasonNumber,
      name: activeSeason.name,
      calendarYear: activeSeason.calendarYear,
      calendarMonth: activeSeason.calendarMonth,
      daysInMonth: activeSeason.daysInMonth,
      totalRounds: activeSeason.totalRounds,
      currentRoundNumber: activeSeason.currentRoundNumber,
      status: activeSeason.status,
      startedAt: activeSeason.startedAt.toISOString(),
      endedAt: activeSeason.endedAt?.toISOString() ?? null,
    };

    const participantDtos: LeagueParticipantDto[] = members.map((m) => ({
      userId: m.userId,
      username: m.user.profile?.username ?? m.user.email,
      tag: m.user.profile?.tag ?? '#D5-0000',
      initials: m.user.profile?.initials ?? 'D5',
      avatarUrl: m.user.profile?.avatarUrl ?? null,
      role: m.role,
      leagueTeamId: m.leagueTeamId,
      teamName: m.team.name,
      teamCode: m.team.code,
      rank: m.team.rank,
      fantasyPoints: m.team.totalFantasyPoints,
      wins: m.team.wins,
      losses: m.team.losses,
    }));

    return {
      league: leagueSummary,
      season: seasonDto,
      members: participantDtos,
    };
  }
}
