import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { pickDefaultLineupForTeam } from '@dreamfive/database';
import {
  type LineupDto,
  type Position,
  PROVISIONAL_GAME_CONFIG,
  type UpdateLineupInput,
} from '@dreamfive/shared';

import { PrismaService } from '../../database/prisma.service.js';

@Injectable()
export class LineupsService {
  constructor(private readonly prisma: PrismaService) {}

  private async resolveTargetRound(
    leagueId: string,
    requestedRound?: number,
  ): Promise<{
    readonly leagueId: string;
    readonly seasonId: string;
    readonly roundNumber: number;
    readonly isLocked: boolean;
    readonly gameClockAt: Date;
    readonly currentRoundNumber: number;
    readonly totalRounds: number;
  }> {
    const league = await this.prisma.client.league.findUnique({ where: { id: leagueId } });
    if (!league) {
      throw new NotFoundException('Liga no encontrada.');
    }

    const season = await this.prisma.client.season.findFirst({
      where: { leagueId, status: 'ACTIVE' },
      orderBy: { seasonNumber: 'desc' },
    });
    if (!season) {
      throw new NotFoundException('No hay temporada activa en esta liga.');
    }

    const roundNumber =
      requestedRound ?? Math.min(season.totalRounds, season.currentRoundNumber + 1);

    if (roundNumber < 1 || roundNumber > season.totalRounds) {
      throw new BadRequestException(
        `Número de jornada inválido (1-${String(season.totalRounds)}).`,
      );
    }

    const lockMinutes = PROVISIONAL_GAME_CONFIG.lineupRules.lockMinutesBeforeTipoff;
    const roundMatches = await this.prisma.client.match.findMany({
      where: { leagueId, seasonId: season.id, roundNumber },
      orderBy: { scheduledAt: 'asc' },
    });
    const anyFinal = roundMatches.some((m) => m.status === 'FINAL');
    const earliestTipoff = roundMatches[0]?.scheduledAt;
    const deadlinePassed = earliestTipoff
      ? league.gameClockAt.getTime() >= earliestTipoff.getTime() - lockMinutes * 60_000
      : false;

    const isLocked = anyFinal || roundNumber <= season.currentRoundNumber || deadlinePassed;

    return {
      leagueId,
      seasonId: season.id,
      roundNumber,
      isLocked,
      gameClockAt: league.gameClockAt,
      currentRoundNumber: season.currentRoundNumber,
      totalRounds: season.totalRounds,
    };
  }

  async getTeamLineup(
    leagueId: string,
    leagueTeamId: string,
    requestedRound?: number,
  ): Promise<LineupDto> {
    const target = await this.resolveTargetRound(leagueId, requestedRound);
    const lockMinutes = PROVISIONAL_GAME_CONFIG.lineupRules.lockMinutesBeforeTipoff;

    const existing = await this.prisma.client.lineup.findUnique({
      where: {
        leagueId_seasonId_leagueTeamId_roundNumber: {
          leagueId,
          seasonId: target.seasonId,
          leagueTeamId,
          roundNumber: target.roundNumber,
        },
      },
    });

    if (existing) {
      return {
        roundNumber: existing.roundNumber,
        isLocked: existing.isLocked || target.isLocked,
        lockMinutesBeforeTipoff: lockMinutes,
        pgPlayerId: existing.pgPlayerId,
        sgPlayerId: existing.sgPlayerId,
        sfPlayerId: existing.sfPlayerId,
        pfPlayerId: existing.pfPlayerId,
        cPlayerId: existing.cPlayerId,
        updatedAt: existing.updatedAt.toISOString(),
      };
    }

    const roster = await this.prisma.client.playerInstance.findMany({
      where: { leagueId, currentTeamId: leagueTeamId, isRetired: false },
    });
    const defaults = pickDefaultLineupForTeam(
      roster.map((p) => ({
        id: p.id,
        position: p.position,
        overallRating: p.overallRating,
        status: p.status,
      })),
    );

    const created = await this.prisma.client.lineup.create({
      data: {
        leagueId,
        seasonId: target.seasonId,
        leagueTeamId,
        roundNumber: target.roundNumber,
        pgPlayerId: defaults.pgPlayerId,
        sgPlayerId: defaults.sgPlayerId,
        sfPlayerId: defaults.sfPlayerId,
        pfPlayerId: defaults.pfPlayerId,
        cPlayerId: defaults.cPlayerId,
        isLocked: target.isLocked,
      },
    });

    return {
      roundNumber: created.roundNumber,
      isLocked: created.isLocked,
      lockMinutesBeforeTipoff: lockMinutes,
      pgPlayerId: created.pgPlayerId,
      sgPlayerId: created.sgPlayerId,
      sfPlayerId: created.sfPlayerId,
      pfPlayerId: created.pfPlayerId,
      cPlayerId: created.cPlayerId,
      updatedAt: created.updatedAt.toISOString(),
    };
  }

  async saveTeamLineup(
    leagueId: string,
    leagueTeamId: string,
    input: UpdateLineupInput,
    requestedRound?: number,
  ): Promise<LineupDto> {
    const target = await this.resolveTargetRound(leagueId, requestedRound);
    if (target.isLocked) {
      throw new ConflictException(
        `La jornada ${String(target.roundNumber)} ya está cerrada para cambios de alineación.`,
      );
    }

    const selectedIds = [
      input.pgPlayerId,
      input.sgPlayerId,
      input.sfPlayerId,
      input.pfPlayerId,
      input.cPlayerId,
    ];
    if (new Set(selectedIds).size !== 5) {
      throw new BadRequestException('Debes alinear 5 jugadores distintos.');
    }

    const ownedPlayers = await this.prisma.client.playerInstance.findMany({
      where: {
        leagueId,
        currentTeamId: leagueTeamId,
        isRetired: false,
        id: { in: selectedIds },
      },
    });

    if (ownedPlayers.length !== 5) {
      throw new BadRequestException(
        'Todos los titulares deben pertenecer a tu plantilla actual en esta liga.',
      );
    }

    const byId = new Map(ownedPlayers.map((p) => [p.id, p]));
    const expectedSlots: { readonly id: string; readonly pos: Position }[] = [
      { id: input.pgPlayerId, pos: 'PG' },
      { id: input.sgPlayerId, pos: 'SG' },
      { id: input.sfPlayerId, pos: 'SF' },
      { id: input.pfPlayerId, pos: 'PF' },
      { id: input.cPlayerId, pos: 'C' },
    ];

    for (const slot of expectedSlots) {
      const player = byId.get(slot.id);
      if (player?.position !== slot.pos) {
        throw new BadRequestException(
          `El jugador seleccionado para ${slot.pos} no ocupa esa posición natural.`,
        );
      }
    }

    const saved = await this.prisma.client.lineup.upsert({
      where: {
        leagueId_seasonId_leagueTeamId_roundNumber: {
          leagueId,
          seasonId: target.seasonId,
          leagueTeamId,
          roundNumber: target.roundNumber,
        },
      },
      update: {
        pgPlayerId: input.pgPlayerId,
        sgPlayerId: input.sgPlayerId,
        sfPlayerId: input.sfPlayerId,
        pfPlayerId: input.pfPlayerId,
        cPlayerId: input.cPlayerId,
      },
      create: {
        leagueId,
        seasonId: target.seasonId,
        leagueTeamId,
        roundNumber: target.roundNumber,
        pgPlayerId: input.pgPlayerId,
        sgPlayerId: input.sgPlayerId,
        sfPlayerId: input.sfPlayerId,
        pfPlayerId: input.pfPlayerId,
        cPlayerId: input.cPlayerId,
        isLocked: false,
      },
    });

    return {
      roundNumber: saved.roundNumber,
      isLocked: saved.isLocked,
      lockMinutesBeforeTipoff: PROVISIONAL_GAME_CONFIG.lineupRules.lockMinutesBeforeTipoff,
      pgPlayerId: saved.pgPlayerId,
      sgPlayerId: saved.sgPlayerId,
      sfPlayerId: saved.sfPlayerId,
      pfPlayerId: saved.pfPlayerId,
      cPlayerId: saved.cPlayerId,
      updatedAt: saved.updatedAt.toISOString(),
    };
  }
}
