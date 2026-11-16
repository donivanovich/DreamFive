import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@dream5/database';
import {
  type AvailabilityStatus,
  type PlayerDetailResponseDto,
  type PlayerInstanceDto,
  type PlayerRole,
  type Position,
  PROVISIONAL_GAME_CONFIG,
  type ScoringWeightsConfig,
} from '@dream5/shared';

import { toPlayerInstanceDto } from '../../common/dto-mappers.js';
import { PrismaService } from '../../database/prisma.service.js';

export interface PlayerQueryFilters {
  readonly search?: string;
  readonly position?: Position;
  readonly role?: PlayerRole;
  readonly status?: AvailabilityStatus;
  readonly teamId?: string;
  readonly sortBy?:
    | 'name'
    | 'position'
    | 'role'
    | 'status'
    | 'pts'
    | 'reb'
    | 'ast'
    | 'fp'
    | 'price'
    | 'delta'
    | 'overall';
  readonly sortDir?: 'asc' | 'desc';
  readonly limit?: number;
  readonly offset?: number;
}

@Injectable()
export class PlayersService {
  constructor(private readonly prisma: PrismaService) {}

  async listPlayers(
    leagueId: string,
    filters: PlayerQueryFilters,
  ): Promise<{ readonly items: readonly PlayerInstanceDto[]; readonly total: number }> {
    const where: Prisma.PlayerInstanceWhereInput = {
      leagueId,
      isRetired: false,
      ...(filters.position ? { position: filters.position } : {}),
      ...(filters.role ? { role: filters.role } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.teamId ? { currentTeamId: filters.teamId } : {}),
      ...(filters.search && filters.search.trim().length > 0
        ? {
            OR: [
              { name: { contains: filters.search.trim(), mode: 'insensitive' } },
              { currentTeam: { name: { contains: filters.search.trim(), mode: 'insensitive' } } },
              { currentTeam: { code: { contains: filters.search.trim(), mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const dir = filters.sortDir ?? 'desc';
    const orderBy: Prisma.PlayerInstanceOrderByWithRelationInput[] =
      filters.sortBy === 'name'
        ? [{ name: dir }, { overallRating: 'desc' }]
        : filters.sortBy === 'position'
          ? [{ position: dir }, { overallRating: 'desc' }]
          : filters.sortBy === 'role'
            ? [{ role: dir }, { overallRating: 'desc' }]
            : filters.sortBy === 'status'
              ? [{ status: dir }, { overallRating: 'desc' }]
              : filters.sortBy === 'pts'
                ? [{ seasonPtsAvg: dir }, { overallRating: 'desc' }]
                : filters.sortBy === 'reb'
                  ? [{ seasonRebAvg: dir }, { overallRating: 'desc' }]
                  : filters.sortBy === 'ast'
                    ? [{ seasonAstAvg: dir }, { overallRating: 'desc' }]
                    : filters.sortBy === 'price'
                      ? [{ priceMillions: dir }, { overallRating: 'desc' }]
                      : filters.sortBy === 'delta'
                        ? [{ priceDeltaMillions: dir }, { overallRating: 'desc' }]
                        : filters.sortBy === 'overall'
                          ? [{ overallRating: dir }, { seasonFantasyPoints: 'desc' }]
                          : [{ seasonFantasyPoints: dir }, { overallRating: 'desc' }];

    const take = Math.max(1, Math.min(540, filters.limit ?? 120));
    const skip = Math.max(0, filters.offset ?? 0);

    const [total, rows] = await Promise.all([
      this.prisma.client.playerInstance.count({ where }),
      this.prisma.client.playerInstance.findMany({
        where,
        include: { currentTeam: { select: { name: true, code: true } } },
        orderBy,
        take,
        skip,
      }),
    ]);

    return {
      total,
      items: rows.map(toPlayerInstanceDto),
    };
  }

  async getPlayerDetail(leagueId: string, playerId: string): Promise<PlayerDetailResponseDto> {
    const [player, league, activeSeason] = await Promise.all([
      this.prisma.client.playerInstance.findFirst({
        where: { id: playerId, leagueId },
        include: { currentTeam: { select: { name: true, code: true } } },
      }),
      this.prisma.client.league.findUnique({
        where: { id: leagueId },
        select: { scoringConfigJson: true },
      }),
      this.prisma.client.season.findFirst({
        where: { leagueId, status: 'ACTIVE' },
        orderBy: { seasonNumber: 'desc' },
        select: { id: true },
      }),
    ]);

    if (!player) {
      throw new NotFoundException('Jugador no encontrado en esta liga.');
    }

    const scoringWeights = parseScoringWeights(league?.scoringConfigJson);
    const roundDp = (value: number): number => Math.round(value * 10) / 10;

    const [recentStats, marketHistory] = await Promise.all([
      this.prisma.client.playerMatchStat.findMany({
        where: {
          leagueId,
          playerInstanceId: player.id,
          ...(activeSeason ? { seasonId: activeSeason.id } : {}),
        },
        include: {
          team: { select: { code: true } },
          match: {
            select: {
              id: true,
              scheduledAt: true,
              homeTeamId: true,
              awayTeamId: true,
              homeScore: true,
              awayScore: true,
              homeTeam: { select: { id: true, name: true, code: true } },
              awayTeam: { select: { id: true, name: true, code: true } },
            },
          },
        },
        orderBy: { roundNumber: 'desc' },
        take: 58,
      }),
      this.prisma.client.marketHistory.findMany({
        where: { leagueId, playerInstanceId: player.id },
        orderBy: { recordedAt: 'desc' },
        take: 15,
      }),
    ]);

    return {
      player: toPlayerInstanceDto(player),
      scoringWeights,
      recentStats: recentStats.map((s) => {
        const isHome = s.match.homeTeamId === s.leagueTeamId;
        const opponent = isHome ? s.match.awayTeam : s.match.homeTeam;
        return {
          matchId: s.matchId,
          roundNumber: s.roundNumber,
          scheduledAt: s.match.scheduledAt.toISOString(),
          teamCode: s.team.code,
          opponentTeamId: opponent.id,
          opponentTeamCode: opponent.code,
          opponentTeamName: opponent.name,
          isHome,
          teamScore: isHome ? s.match.homeScore : s.match.awayScore,
          opponentScore: isHome ? s.match.awayScore : s.match.homeScore,
          minutes: s.minutes,
          pts: s.pts,
          reb: s.reb,
          ast: s.ast,
          stl: s.stl,
          blk: s.blk,
          tov: s.tov,
          pf: s.pf,
          fantasyPoints: s.fantasyPoints,
          wasStarter: s.wasStarter,
          ejected: s.ejected,
          injured: s.injured,
          dpBreakdown: {
            pts: roundDp(s.pts * scoringWeights.pts),
            reb: roundDp(s.reb * scoringWeights.reb),
            ast: roundDp(s.ast * scoringWeights.ast),
            stl: roundDp(s.stl * scoringWeights.stl),
            blk: roundDp(s.blk * scoringWeights.blk),
            tov: roundDp(s.tov * scoringWeights.tov),
            pf: roundDp(s.pf * scoringWeights.pf),
            minutes: roundDp(s.minutes * scoringWeights.min),
          },
        };
      }),
      marketHistory: marketHistory.map((h) => ({
        priceMillions: h.priceMillions,
        deltaMillions: h.deltaMillions,
        reason: h.reason,
        recordedAt: h.recordedAt.toISOString(),
      })),
    };
  }
}

function parseScoringWeights(raw: unknown): ScoringWeightsConfig {
  const defaults = PROVISIONAL_GAME_CONFIG.scoringWeights;
  if (!raw || typeof raw !== 'object') {
    return defaults;
  }
  const obj = raw as Record<string, unknown>;
  const readNum = (key: keyof ScoringWeightsConfig): number => {
    const val = obj[key];
    return typeof val === 'number' && Number.isFinite(val) ? val : defaults[key];
  };
  return {
    pts: readNum('pts'),
    reb: readNum('reb'),
    ast: readNum('ast'),
    stl: readNum('stl'),
    blk: readNum('blk'),
    tov: readNum('tov'),
    pf: readNum('pf'),
    min: readNum('min'),
  };
}
