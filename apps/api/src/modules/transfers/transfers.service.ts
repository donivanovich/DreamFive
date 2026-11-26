import { randomUUID } from 'node:crypto';

import {
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  createAndEvaluateTransferOffer,
  executeAcceptedTransferInTx,
  findActiveTransferBlocks,
  getTeamCompletedMatchesCount,
  recordHumanTeamMailsInTx,
  resolveMailSeasonIdInTx,
  TransferValidationError,
} from '@dreamfive/database';
import {
  type CreateTransferOfferInput,
  SOCKET_EVENTS,
  type TransferBlockedPlayerDto,
  type TransferOfferDto,
  type TransferPlayerSummaryDto,
} from '@dreamfive/shared';

import { PrismaService } from '../../database/prisma.service.js';
import { RealtimeService } from '../../realtime/realtime.service.js';

@Injectable()
export class TransfersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  async listLeagueTransfers(leagueId: string, callerTeamId: string) {
    const [offers, history, players, userTeam, cooldowns] = await Promise.all([
      this.prisma.client.transferOffer.findMany({
        where: {
          leagueId,
          OR: [{ proposingTeamId: callerTeamId }, { receivingTeamId: callerTeamId }],
        },
        include: {
          proposingTeam: { select: { id: true, name: true, code: true, isCpuControlled: true } },
          receivingTeam: { select: { id: true, name: true, code: true, isCpuControlled: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.prisma.client.transferHistory.findMany({
        where: { leagueId },
        include: {
          fromTeam: { select: { name: true, code: true } },
          toTeam: { select: { name: true, code: true } },
        },
        orderBy: { executedAt: 'desc' },
        take: 200,
      }),
      this.prisma.client.playerInstance.findMany({
        where: { leagueId, isRetired: false },
        select: { id: true, name: true, position: true, role: true, priceMillions: true },
      }),
      this.prisma.client.leagueTeam.findFirst({
        where: { id: callerTeamId, leagueId },
        select: { budgetMillions: true },
      }),
      findActiveTransferBlocks(this.prisma.client, {
        leagueId,
        proposingTeamId: callerTeamId,
      }),
    ]);

    const blockedPlayers: TransferBlockedPlayerDto[] = cooldowns.map((c) => ({
      playerId: c.playerId,
      playerName: c.playerName,
      reason: c.reason,
      remainingMatches: c.remainingMatches,
      unlocksAtTeamMatches: c.unlocksAtTeamMatches,
    }));

    const playerById = new Map<string, TransferPlayerSummaryDto>(
      players.map((p) => [
        p.id,
        {
          id: p.id,
          name: p.name,
          position: p.position,
          role: p.role,
          priceMillions: p.priceMillions,
        },
      ]),
    );

    const mapPlayers = (ids: readonly string[]): TransferPlayerSummaryDto[] => {
      const list: TransferPlayerSummaryDto[] = [];
      for (const id of ids) {
        const found = playerById.get(id);
        if (found) {
          list.push(found);
        }
      }
      return list;
    };

    const offerDtos: TransferOfferDto[] = offers.map((o) => ({
      id: o.id,
      leagueId: o.leagueId,
      proposingTeamId: o.proposingTeam.id,
      proposingTeamName: o.proposingTeam.name,
      proposingTeamCode: o.proposingTeam.code,
      receivingTeamId: o.receivingTeam.id,
      receivingTeamName: o.receivingTeam.name,
      receivingTeamCode: o.receivingTeam.code,
      isProposingCpu: o.proposingTeam.isCpuControlled,
      isReceivingCpu: o.receivingTeam.isCpuControlled,
      offeredPlayers: mapPlayers(o.offeredPlayerIds),
      requestedPlayers: mapPlayers(o.requestedPlayerIds),
      cashOfferedMillions: o.cashOfferedMillions,
      cashRequestedMillions: o.cashRequestedMillions,
      status: o.status,
      responseNote: o.responseNote,
      createdAt: o.createdAt.toISOString(),
      respondedAt: o.respondedAt?.toISOString() ?? null,
    }));

    return {
      userTeamId: callerTeamId,
      userBudgetMillions: userTeam?.budgetMillions ?? 0,
      blockedPlayers,
      offers: offerDtos,
      history: history.map((h) => ({
        id: h.id,
        offerId: h.offerId,
        fromTeamName: h.fromTeam.name,
        fromTeamCode: h.fromTeam.code,
        toTeamName: h.toTeam.name,
        toTeamCode: h.toTeam.code,
        movedPlayers: mapPlayers(h.movedPlayerIds),
        cashTransferredNet: h.cashTransferredNet,
        summary: h.summary,
        executedAt: h.executedAt.toISOString(),
      })),
    };
  }

  async createOffer(params: {
    readonly leagueId: string;
    readonly userId: string;
    readonly input: CreateTransferOfferInput;
  }) {
    try {
      const result = await createAndEvaluateTransferOffer(this.prisma.client, {
        leagueId: params.leagueId,
        userId: params.userId,
        receivingTeamId: params.input.receivingTeamId,
        offeredPlayerIds: params.input.offeredPlayerIds,
        requestedPlayerIds: params.input.requestedPlayerIds,
        cashOfferedMillions: params.input.cashOfferedMillions,
        cashRequestedMillions: params.input.cashRequestedMillions,
      });

      this.realtime.emitLeagueEvent({
        leagueId: params.leagueId,
        eventType: SOCKET_EVENTS.transferUpdated,
        timestamp: new Date().toISOString(),
      });
      this.realtime.emitLeagueEvent({
        leagueId: params.leagueId,
        eventType: SOCKET_EVENTS.mailUpdated,
        timestamp: new Date().toISOString(),
      });

      return result;
    } catch (error: unknown) {
      if (error instanceof TransferValidationError) {
        throw new HttpException(error.message, error.statusCode);
      }
      throw error;
    }
  }

  async respondOffer(params: {
    readonly leagueId: string;
    readonly offerId: string;
    readonly callerTeamId: string;
    readonly action: 'ACCEPT' | 'REJECT';
    readonly note?: string;
    readonly idempotencyKey?: string;
  }) {
    const offer = await this.prisma.client.transferOffer.findFirst({
      where: { id: params.offerId, leagueId: params.leagueId },
      include: {
        proposingTeam: { select: { name: true } },
        receivingTeam: { select: { name: true } },
      },
    });
    if (!offer) {
      throw new NotFoundException('Oferta no encontrada en esta liga.');
    }
    if (offer.receivingTeamId !== params.callerTeamId) {
      throw new ForbiddenException(
        'Solo el equipo destinatario puede aceptar o rechazar esta oferta.',
      );
    }
    if (offer.status !== 'PENDING') {
      throw new ConflictException(`Esta oferta ya tiene estado ${offer.status}.`);
    }

    if (params.action === 'REJECT') {
      const [league, proposingTeamMatches] = await Promise.all([
        this.prisma.client.league.findUnique({
          where: { id: params.leagueId },
          select: { gameClockAt: true },
        }),
        getTeamCompletedMatchesCount(this.prisma.client, params.leagueId, offer.proposingTeamId),
      ]);
      const rejectNote =
        params.note ??
        'Oferta rechazada por el mánager. Tanto el jugador propuesto como el deseado quedan bloqueados 1 partido.';
      await this.prisma.client.transferOffer.update({
        where: { id: offer.id },
        data: {
          status: 'REJECTED',
          responseNote: rejectNote,
          respondedAt: new Date(),
          rejectedGameClockAt: league?.gameClockAt ?? new Date(),
          rejectedAtTeamMatches: proposingTeamMatches,
        },
      });
      const mailSeasonId = await resolveMailSeasonIdInTx(this.prisma.client, params.leagueId);
      if (mailSeasonId) {
        await recordHumanTeamMailsInTx(this.prisma.client, [
          {
            leagueId: params.leagueId,
            seasonId: mailSeasonId,
            leagueTeamId: offer.proposingTeamId,
            roundNumber: null,
            category: 'TRANSFER_REJECTED',
            subject: `Trade Offer Rejected by ${offer.receivingTeam.name}`,
            body: `${offer.receivingTeam.name} rejected your trade proposal. Both offered and requested players have a 1-match transfer cooldown.`,
            metadata: {
              offerId: offer.id,
              proposingTeamName: offer.proposingTeam.name,
              receivingTeamName: offer.receivingTeam.name,
              responseNote: rejectNote,
            },
          },
          {
            leagueId: params.leagueId,
            seasonId: mailSeasonId,
            leagueTeamId: offer.receivingTeamId,
            roundNumber: null,
            category: 'TRANSFER_REJECTED',
            subject: `Declined Trade Proposal from ${offer.proposingTeam.name}`,
            body: `You declined the incoming trade proposal from ${offer.proposingTeam.name}.`,
            metadata: {
              offerId: offer.id,
              proposingTeamName: offer.proposingTeam.name,
              receivingTeamName: offer.receivingTeam.name,
              responseNote: rejectNote,
            },
          },
        ]);
      }
      this.realtime.emitLeagueEvent({
        leagueId: params.leagueId,
        eventType: SOCKET_EVENTS.transferUpdated,
        timestamp: new Date().toISOString(),
      });
      this.realtime.emitLeagueEvent({
        leagueId: params.leagueId,
        eventType: SOCKET_EVENTS.mailUpdated,
        timestamp: new Date().toISOString(),
      });
      return { offerId: offer.id, status: 'REJECTED' as const };
    }

    try {
      const executed = await this.prisma.client.$transaction(async (tx) =>
        executeAcceptedTransferInTx(tx, {
          leagueId: params.leagueId,
          offerId: offer.id,
          idempotencyKey: params.idempotencyKey ?? `human-${offer.id}-${randomUUID()}`,
          responseNote:
            params.note ??
            `¡Enhorabuena! Los ${offer.receivingTeam.name} y los ${offer.proposingTeam.name} han cerrado el traspaso.`,
        }),
      );

      this.realtime.emitLeagueEvent({
        leagueId: params.leagueId,
        eventType: SOCKET_EVENTS.transferUpdated,
        timestamp: new Date().toISOString(),
      });
      this.realtime.emitLeagueEvent({
        leagueId: params.leagueId,
        eventType: SOCKET_EVENTS.mailUpdated,
        timestamp: new Date().toISOString(),
      });

      return executed;
    } catch (error: unknown) {
      if (error instanceof TransferValidationError) {
        throw new HttpException(error.message, error.statusCode);
      }
      throw error;
    }
  }

  async cancelOffer(params: {
    readonly leagueId: string;
    readonly offerId: string;
    readonly callerTeamId: string;
  }) {
    const offer = await this.prisma.client.transferOffer.findFirst({
      where: { id: params.offerId, leagueId: params.leagueId },
      include: {
        proposingTeam: { select: { name: true } },
        receivingTeam: { select: { name: true } },
      },
    });
    if (!offer) {
      throw new NotFoundException('Oferta no encontrada en esta liga.');
    }
    if (offer.proposingTeamId !== params.callerTeamId) {
      throw new ForbiddenException('Solo el equipo proponente puede cancelar esta oferta.');
    }
    if (offer.status !== 'PENDING') {
      throw new ConflictException('Solo se pueden cancelar ofertas pendientes.');
    }

    await this.prisma.client.transferOffer.update({
      where: { id: offer.id },
      data: {
        status: 'CANCELLED',
        responseNote: 'Retirada por el equipo proponente.',
        respondedAt: new Date(),
      },
    });

    this.realtime.emitLeagueEvent({
      leagueId: params.leagueId,
      eventType: SOCKET_EVENTS.transferUpdated,
      timestamp: new Date().toISOString(),
    });

    return { offerId: offer.id, status: 'CANCELLED' as const };
  }
}
