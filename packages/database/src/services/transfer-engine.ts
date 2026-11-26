import { randomUUID } from 'node:crypto';

import {
  formatCleanDecimal,
  LEAGUE_RULES,
  type Position,
  PROVISIONAL_GAME_CONFIG,
  type TransferStatus,
} from '@dream5/shared';
import { createSeededRng } from '@dream5/simulation-engine';

import type { Prisma, PrismaClient } from '../generated/prisma/client.js';
import { pickDefaultLineupForTeam } from './league-bootstrap.js';
import {
  type CreateLeagueMailInput,
  recordHumanTeamMailsInTx,
  resolveMailSeasonIdInTx,
} from './league-mail.js';

export class TransferValidationError extends Error {
  public readonly statusCode: number;

  public constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'TransferValidationError';
    this.statusCode = statusCode;
  }
}

export interface TransferEligibilityInput {
  readonly proposingRoster: readonly {
    readonly id: string;
    readonly position: Position;
    readonly priceMillions: number;
  }[];
  readonly receivingRoster: readonly {
    readonly id: string;
    readonly position: Position;
    readonly priceMillions: number;
  }[];
  readonly proposingBudgetMillions: number;
  readonly receivingBudgetMillions: number;
  readonly offeredPlayerIds: readonly string[];
  readonly requestedPlayerIds: readonly string[];
  readonly cashOfferedMillions: number;
  readonly cashRequestedMillions: number;
}

export interface TransferValuationSummary {
  readonly offeredTotalValue: number;
  readonly requestedTotalValue: number;
  readonly ratio: number;
}

const ALL_POSITIONS: readonly Position[] = ['PG', 'SG', 'SF', 'PF', 'C'];

/**
 * Valida las reglas puras de traspaso en DREAM5:
 * - No duplicados ni jugadores ajenos al equipo correspondiente.
 * - Ambas plantillas resultantes mantienen exactamente 18 jugadores.
 * - Ambas plantillas resultantes cubren al menos 1 jugador en PG, SG, SF, PF y C.
 * - Presupuestos suficientes para efectivo ofrecido/solicitado.
 * - Oferta >= 50% del valor solicitado.
 */
export function validateTransferInvariants(
  input: TransferEligibilityInput,
): TransferValuationSummary {
  const uniqueOffered = [...new Set(input.offeredPlayerIds)];
  const uniqueRequested = [...new Set(input.requestedPlayerIds)];

  if (
    uniqueOffered.length !== input.offeredPlayerIds.length ||
    uniqueRequested.length !== input.requestedPlayerIds.length
  ) {
    throw new TransferValidationError('No puedes incluir jugadores duplicados en el traspaso.');
  }

  if (uniqueOffered.length === 0 && input.cashOfferedMillions <= 0) {
    throw new TransferValidationError('Debes ofrecer al menos un jugador o efectivo en la oferta.');
  }
  if (uniqueRequested.length === 0 && input.cashRequestedMillions <= 0) {
    throw new TransferValidationError('Debes solicitar al menos un jugador o efectivo.');
  }
  if (input.cashOfferedMillions < 0 || input.cashRequestedMillions < 0) {
    throw new TransferValidationError('Los importes en efectivo no pueden ser negativos.');
  }

  const propMap = new Map(input.proposingRoster.map((p) => [p.id, p]));
  const recMap = new Map(input.receivingRoster.map((p) => [p.id, p]));

  const offeredPlayers = uniqueOffered.map((id) => {
    const found = propMap.get(id);
    if (!found) {
      throw new TransferValidationError(
        `El jugador ${id} no pertenece actualmente a tu plantilla.`,
      );
    }
    return found;
  });

  const requestedPlayers = uniqueRequested.map((id) => {
    const found = recMap.get(id);
    if (!found) {
      throw new TransferValidationError(
        `El jugador ${id} no pertenece actualmente al equipo receptor.`,
      );
    }
    return found;
  });

  if (input.cashOfferedMillions < 0 || input.cashRequestedMillions < 0) {
    throw new TransferValidationError('Los importes en efectivo no pueden ser negativos.');
  }
  if (
    (input.cashOfferedMillions > 0 && input.cashOfferedMillions < 0.1) ||
    (input.cashRequestedMillions > 0 && input.cashRequestedMillions < 0.1)
  ) {
    throw new TransferValidationError(
      'El importe mínimo en efectivo por operación es de 0.1M (100k).',
    );
  }
  if (input.cashOfferedMillions > input.proposingBudgetMillions + 0.001) {
    throw new TransferValidationError(
      'Tu franquicia no dispone de presupuesto suficiente para el efectivo ofrecido.',
    );
  }
  if (input.cashRequestedMillions > input.receivingBudgetMillions + 0.001) {
    throw new TransferValidationError(
      'La franquicia receptora no dispone de presupuesto suficiente para el efectivo solicitado.',
    );
  }

  const offeredSet = new Set(uniqueOffered);
  const requestedSet = new Set(uniqueRequested);

  const postProposing = [
    ...input.proposingRoster.filter((p) => !offeredSet.has(p.id)),
    ...requestedPlayers,
  ];
  const postReceiving = [
    ...input.receivingRoster.filter((p) => !requestedSet.has(p.id)),
    ...offeredPlayers,
  ];

  if (
    postProposing.length !== LEAGUE_RULES.squadSize ||
    postReceiving.length !== LEAGUE_RULES.squadSize
  ) {
    throw new TransferValidationError(
      `Ambas plantillas deben mantener exactamente ${String(LEAGUE_RULES.squadSize)} jugadores tras el traspaso (resultante: ${String(postProposing.length)} y ${String(postReceiving.length)}).`,
    );
  }

  for (const pos of ALL_POSITIONS) {
    if (!postProposing.some((p) => p.position === pos)) {
      throw new TransferValidationError(
        `Tu plantilla resultante quedaría sin ningún jugador en la posición ${pos}.`,
      );
    }
    if (!postReceiving.some((p) => p.position === pos)) {
      throw new TransferValidationError(
        `La plantilla receptora quedaría sin ningún jugador en la posición ${pos}.`,
      );
    }
  }

  const offeredPlayersValue = offeredPlayers.reduce((sum, p) => sum + p.priceMillions, 0);
  const requestedPlayersValue = requestedPlayers.reduce((sum, p) => sum + p.priceMillions, 0);
  const offeredTotalValue =
    Math.round((offeredPlayersValue + input.cashOfferedMillions) * 100) / 100;
  const requestedTotalValue =
    Math.round((requestedPlayersValue + input.cashRequestedMillions) * 100) / 100;

  if (
    requestedTotalValue > 0 &&
    offeredTotalValue + 0.001 < requestedTotalValue * LEAGUE_RULES.minTradeValueRatio
  ) {
    const minRequired = Math.round(requestedTotalValue * LEAGUE_RULES.minTradeValueRatio * 10) / 10;
    throw new TransferValidationError(
      `La oferta (${String(offeredTotalValue)}M) no alcanza el mínimo obligatorio del 50% del valor solicitado (${String(minRequired)}M requeridos).`,
    );
  }

  const ratio = requestedTotalValue > 0 ? offeredTotalValue / requestedTotalValue : 1;
  return { offeredTotalValue, requestedTotalValue, ratio };
}

async function repairOpenLineupsAfterTradeInTx(
  tx: Prisma.TransactionClient,
  params: { readonly leagueId: string; readonly teamId: string },
): Promise<void> {
  const openLineups = await tx.lineup.findMany({
    where: {
      leagueId: params.leagueId,
      leagueTeamId: params.teamId,
      isLocked: false,
    },
  });
  if (openLineups.length === 0) {
    return;
  }

  const currentRoster = await tx.playerInstance.findMany({
    where: { leagueId: params.leagueId, currentTeamId: params.teamId, isRetired: false },
  });
  const rosterIdSet = new Set(currentRoster.map((p) => p.id));

  for (const l of openLineups) {
    const needsRepair =
      (Boolean(l.pgPlayerId) && !rosterIdSet.has(l.pgPlayerId ?? '')) ||
      (Boolean(l.sgPlayerId) && !rosterIdSet.has(l.sgPlayerId ?? '')) ||
      (Boolean(l.sfPlayerId) && !rosterIdSet.has(l.sfPlayerId ?? '')) ||
      (Boolean(l.pfPlayerId) && !rosterIdSet.has(l.pfPlayerId ?? '')) ||
      (Boolean(l.cPlayerId) && !rosterIdSet.has(l.cPlayerId ?? ''));

    if (!needsRepair) {
      continue;
    }

    const fallback = pickDefaultLineupForTeam(
      currentRoster.map((p) => ({
        id: p.id,
        position: p.position,
        overallRating: p.overallRating,
        status: p.status,
      })),
    );

    await tx.lineup.update({
      where: { id: l.id },
      data: {
        pgPlayerId:
          l.pgPlayerId && rosterIdSet.has(l.pgPlayerId) ? l.pgPlayerId : fallback.pgPlayerId,
        sgPlayerId:
          l.sgPlayerId && rosterIdSet.has(l.sgPlayerId) ? l.sgPlayerId : fallback.sgPlayerId,
        sfPlayerId:
          l.sfPlayerId && rosterIdSet.has(l.sfPlayerId) ? l.sfPlayerId : fallback.sfPlayerId,
        pfPlayerId:
          l.pfPlayerId && rosterIdSet.has(l.pfPlayerId) ? l.pfPlayerId : fallback.pfPlayerId,
        cPlayerId: l.cPlayerId && rosterIdSet.has(l.cPlayerId) ? l.cPlayerId : fallback.cPlayerId,
      },
    });
  }
}

/**
 * Ejecuta de forma atómica e idempotente una oferta de traspaso aceptada.
 */
export async function executeAcceptedTransferInTx(
  tx: Prisma.TransactionClient,
  params: {
    readonly leagueId: string;
    readonly offerId: string;
    readonly idempotencyKey: string;
    readonly responseNote?: string;
  },
): Promise<{ readonly offerId: string; readonly status: TransferStatus }> {
  const existingTx = await tx.transaction.findUnique({
    where: { idempotencyKey: params.idempotencyKey },
  });
  if (existingTx) {
    return { offerId: params.offerId, status: 'ACCEPTED' };
  }

  const offer = await tx.transferOffer.findFirst({
    where: { id: params.offerId, leagueId: params.leagueId },
  });
  if (!offer) {
    throw new TransferValidationError('Oferta de traspaso no encontrada en esta liga.', 404);
  }
  if (offer.status !== 'PENDING') {
    throw new TransferValidationError(`La oferta ya fue resuelta con estado ${offer.status}.`, 409);
  }

  const proposingTeam = await tx.leagueTeam.findFirst({
    where: { id: offer.proposingTeamId, leagueId: params.leagueId },
  });
  const receivingTeam = await tx.leagueTeam.findFirst({
    where: { id: offer.receivingTeamId, leagueId: params.leagueId },
  });
  const proposingRoster = await tx.playerInstance.findMany({
    where: { leagueId: params.leagueId, currentTeamId: offer.proposingTeamId, isRetired: false },
  });
  const receivingRoster = await tx.playerInstance.findMany({
    where: { leagueId: params.leagueId, currentTeamId: offer.receivingTeamId, isRetired: false },
  });

  if (!proposingTeam || !receivingTeam) {
    throw new TransferValidationError('Alguno de los equipos del traspaso ya no existe.', 404);
  }

  validateTransferInvariants({
    proposingRoster: proposingRoster.map((p) => ({
      id: p.id,
      position: p.position,
      priceMillions: p.priceMillions,
    })),
    receivingRoster: receivingRoster.map((p) => ({
      id: p.id,
      position: p.position,
      priceMillions: p.priceMillions,
    })),
    proposingBudgetMillions: proposingTeam.budgetMillions,
    receivingBudgetMillions: receivingTeam.budgetMillions,
    offeredPlayerIds: offer.offeredPlayerIds,
    requestedPlayerIds: offer.requestedPlayerIds,
    cashOfferedMillions: offer.cashOfferedMillions,
    cashRequestedMillions: offer.cashRequestedMillions,
  });

  const now = new Date();
  const claimed = await tx.transferOffer.updateMany({
    where: { id: offer.id, leagueId: params.leagueId, status: 'PENDING' },
    data: {
      status: 'ACCEPTED',
      responseNote: params.responseNote ?? 'Traspaso aceptado y ejecutado',
      respondedAt: now,
    },
  });
  if (claimed.count !== 1) {
    throw new TransferValidationError('La oferta fue procesada de forma concurrente.', 409);
  }

  const [proposingMatches, receivingMatches] = await Promise.all([
    getTeamCompletedMatchesCount(tx, params.leagueId, proposingTeam.id),
    getTeamCompletedMatchesCount(tx, params.leagueId, receivingTeam.id),
  ]);
  const acquiredLockMatches = PROVISIONAL_GAME_CONFIG.transfers.acquiredPlayerLockMatches;

  if (offer.offeredPlayerIds.length > 0) {
    await tx.playerInstance.updateMany({
      where: { id: { in: offer.offeredPlayerIds }, leagueId: params.leagueId },
      data: {
        currentTeamId: receivingTeam.id,
        tradeLockTeamId: receivingTeam.id,
        tradeLockUntilTeamMatches: receivingMatches + acquiredLockMatches,
      },
    });
    await tx.rosterSlot.updateMany({
      where: { playerInstanceId: { in: offer.offeredPlayerIds }, leagueId: params.leagueId },
      data: { leagueTeamId: receivingTeam.id, acquiredAt: now },
    });
  }

  if (offer.requestedPlayerIds.length > 0) {
    await tx.playerInstance.updateMany({
      where: { id: { in: offer.requestedPlayerIds }, leagueId: params.leagueId },
      data: {
        currentTeamId: proposingTeam.id,
        tradeLockTeamId: proposingTeam.id,
        tradeLockUntilTeamMatches: proposingMatches + acquiredLockMatches,
      },
    });
    await tx.rosterSlot.updateMany({
      where: { playerInstanceId: { in: offer.requestedPlayerIds }, leagueId: params.leagueId },
      data: { leagueTeamId: proposingTeam.id, acquiredAt: now },
    });
  }

  const netBudgetDeltaToReceiving =
    Math.round((offer.cashOfferedMillions - offer.cashRequestedMillions) * 100) / 100;

  if (Math.abs(netBudgetDeltaToReceiving) > 0.001) {
    await tx.leagueTeam.update({
      where: { id: proposingTeam.id },
      data: {
        budgetMillions:
          Math.round((proposingTeam.budgetMillions - netBudgetDeltaToReceiving) * 100) / 100,
      },
    });
    await tx.leagueTeam.update({
      where: { id: receivingTeam.id },
      data: {
        budgetMillions:
          Math.round((receivingTeam.budgetMillions + netBudgetDeltaToReceiving) * 100) / 100,
      },
    });
  }

  const movedIds = [...offer.offeredPlayerIds, ...offer.requestedPlayerIds];
  const offeredNames = proposingRoster
    .filter((p) => offer.offeredPlayerIds.includes(p.id))
    .map((p) => p.name);
  const requestedNames = receivingRoster
    .filter((p) => offer.requestedPlayerIds.includes(p.id))
    .map((p) => p.name);

  await tx.transaction.create({
    data: {
      leagueId: params.leagueId,
      offerId: offer.id,
      idempotencyKey: params.idempotencyKey,
      payloadJson: {
        proposingTeamId: proposingTeam.id,
        receivingTeamId: receivingTeam.id,
        offeredPlayerIds: offer.offeredPlayerIds,
        requestedPlayerIds: offer.requestedPlayerIds,
        cashOfferedMillions: offer.cashOfferedMillions,
        cashRequestedMillions: offer.cashRequestedMillions,
      },
      executedAt: now,
    },
  });

  await tx.transferHistory.create({
    data: {
      leagueId: params.leagueId,
      offerId: offer.id,
      fromTeamId: proposingTeam.id,
      toTeamId: receivingTeam.id,
      movedPlayerIds: movedIds,
      cashTransferredNet: netBudgetDeltaToReceiving,
      summary: `${proposingTeam.name} (${offeredNames.join(', ')}) ⇄ ${receivingTeam.name} (${requestedNames.join(', ')})`,
      executedAt: now,
    },
  });

  // Cancelamos otras ofertas pendientes en esta liga que dependan de jugadores recién traspasados
  const tradeMails: CreateLeagueMailInput[] = [];
  const mailSeasonId = await resolveMailSeasonIdInTx(tx, params.leagueId);

  if (mailSeasonId) {
    const tradeMetadata = {
      offerId: offer.id,
      proposingTeamId: proposingTeam.id,
      proposingTeamName: proposingTeam.name,
      proposingTeamCode: proposingTeam.code,
      receivingTeamId: receivingTeam.id,
      receivingTeamName: receivingTeam.name,
      receivingTeamCode: receivingTeam.code,
      offeredPlayers: offeredNames,
      requestedPlayers: requestedNames,
      cashOfferedMillions: offer.cashOfferedMillions,
      cashRequestedMillions: offer.cashRequestedMillions,
      responseNote: params.responseNote ?? null,
    };
    tradeMails.push(
      {
        leagueId: params.leagueId,
        seasonId: mailSeasonId,
        leagueTeamId: proposingTeam.id,
        roundNumber: null,
        category: 'TRANSFER_ACCEPTED',
        subject: `Trade Accepted with ${receivingTeam.name}`,
        body: `Your trade agreement with ${receivingTeam.name} is official. Outgoing: ${offeredNames.join(', ')}. Incoming: ${requestedNames.join(', ')}.`,
        metadata: tradeMetadata,
      },
      {
        leagueId: params.leagueId,
        seasonId: mailSeasonId,
        leagueTeamId: receivingTeam.id,
        roundNumber: null,
        category: 'TRANSFER_ACCEPTED',
        subject: `Trade Completed with ${proposingTeam.name}`,
        body: `Your trade with ${proposingTeam.name} has been completed. Incoming: ${offeredNames.join(', ')}. Outgoing: ${requestedNames.join(', ')}.`,
        metadata: tradeMetadata,
      },
    );
  }

  if (movedIds.length > 0) {
    const conflictingPending = await tx.transferOffer.findMany({
      where: {
        leagueId: params.leagueId,
        status: 'PENDING',
        id: { not: offer.id },
      },
    });
    const movedSet = new Set(movedIds);
    const cancelReason = 'Cancelada automáticamente porque uno de los jugadores cambió de equipo.';
    for (const other of conflictingPending) {
      const touchesMoved =
        other.offeredPlayerIds.some((id) => movedSet.has(id)) ||
        other.requestedPlayerIds.some((id) => movedSet.has(id));
      if (touchesMoved) {
        await tx.transferOffer.update({
          where: { id: other.id },
          data: {
            status: 'CANCELLED',
            responseNote: cancelReason,
            respondedAt: now,
          },
        });
        if (mailSeasonId) {
          tradeMails.push(
            {
              leagueId: params.leagueId,
              seasonId: mailSeasonId,
              leagueTeamId: other.proposingTeamId,
              roundNumber: null,
              category: 'TRANSFER_REJECTED',
              subject: 'Trade Offer Cancelled (Player Moved)',
              body: 'A pending trade proposal was automatically cancelled because an involved player moved to another franchise.',
              metadata: { offerId: other.id, reason: 'PLAYER_MOVED' },
            },
            {
              leagueId: params.leagueId,
              seasonId: mailSeasonId,
              leagueTeamId: other.receivingTeamId,
              roundNumber: null,
              category: 'TRANSFER_REJECTED',
              subject: 'Incoming Trade Cancelled (Player Moved)',
              body: 'An incoming trade proposal was cancelled automatically because one of the involved players joined another franchise.',
              metadata: { offerId: other.id, reason: 'PLAYER_MOVED' },
            },
          );
        }
      }
    }
  }

  await recordHumanTeamMailsInTx(tx, tradeMails);

  await repairOpenLineupsAfterTradeInTx(tx, {
    leagueId: params.leagueId,
    teamId: proposingTeam.id,
  });
  await repairOpenLineupsAfterTradeInTx(tx, {
    leagueId: params.leagueId,
    teamId: receivingTeam.id,
  });

  return { offerId: offer.id, status: 'ACCEPTED' };
}

export async function getTeamCompletedMatchesCount(
  db: Prisma.TransactionClient | PrismaClient,
  leagueId: string,
  teamId: string,
): Promise<number> {
  return db.match.count({
    where: {
      leagueId,
      status: 'FINAL',
      OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
    },
  });
}

export interface TransferCooldownEntry {
  readonly playerId: string;
  readonly playerName: string;
  readonly reason: 'REJECTED_OFFER' | 'RECENT_TRADE_ACQUISITION';
  readonly remainingMatches: number;
  readonly unlocksAtTeamMatches: number;
}

/**
 * Comprueba bloqueos de mercado basados en partidos jugados:
 * - Tras un rechazo: tanto jugadores propuestos como solicitados quedan bloqueados 1 partido.
 * - Tras un traspaso completado: cada jugador incorporado queda bloqueado 5 partidos.
 */
export async function findActiveTransferBlocks(
  db: Prisma.TransactionClient | PrismaClient,
  params: {
    readonly leagueId: string;
    readonly proposingTeamId: string;
    readonly candidatePlayerIds?: readonly string[];
  },
): Promise<readonly TransferCooldownEntry[]> {
  const rejectionCooldownMatches = PROVISIONAL_GAME_CONFIG.transfers.rejectionCooldownMatches;
  const acquiredLockMatches = PROVISIONAL_GAME_CONFIG.transfers.acquiredPlayerLockMatches;
  const candidateSet =
    params.candidatePlayerIds && params.candidatePlayerIds.length > 0
      ? new Set(params.candidatePlayerIds)
      : null;

  const [proposingTeamMatches, rejectedOffers, lockedPlayers] = await Promise.all([
    getTeamCompletedMatchesCount(db, params.leagueId, params.proposingTeamId),
    db.transferOffer.findMany({
      where: {
        leagueId: params.leagueId,
        proposingTeamId: params.proposingTeamId,
        status: 'REJECTED',
        rejectedAtTeamMatches: { not: null },
      },
      orderBy: { respondedAt: 'desc' },
      take: 150,
    }),
    db.playerInstance.findMany({
      where: {
        leagueId: params.leagueId,
        isRetired: false,
        tradeLockTeamId: { not: null },
        tradeLockUntilTeamMatches: { not: null },
        ...(candidateSet ? { id: { in: [...candidateSet] } } : {}),
      },
      select: {
        id: true,
        name: true,
        currentTeamId: true,
        tradeLockTeamId: true,
        tradeLockUntilTeamMatches: true,
      },
    }),
  ]);

  const activeByPlayer = new Map<
    string,
    {
      reason: 'REJECTED_OFFER' | 'RECENT_TRADE_ACQUISITION';
      remainingMatches: number;
      unlocksAtTeamMatches: number;
      playerName?: string;
    }
  >();

  for (const offer of rejectedOffers) {
    if (offer.rejectedAtTeamMatches === null) {
      continue;
    }
    // Si el reloj fue sincronizado atrás revirtiendo jornadas/temporadas, ignoramos rechazos del futuro borrado
    if (offer.rejectedAtTeamMatches > proposingTeamMatches) {
      continue;
    }
    const unlocksAtTeamMatches = offer.rejectedAtTeamMatches + rejectionCooldownMatches;
    const remainingMatches = unlocksAtTeamMatches - proposingTeamMatches;
    if (remainingMatches <= 0 || remainingMatches > rejectionCooldownMatches) {
      continue;
    }

    for (const pid of [...offer.offeredPlayerIds, ...offer.requestedPlayerIds]) {
      if (candidateSet && !candidateSet.has(pid)) {
        continue;
      }
      const prev = activeByPlayer.get(pid);
      if (!prev || remainingMatches > prev.remainingMatches) {
        activeByPlayer.set(pid, {
          reason: 'REJECTED_OFFER',
          remainingMatches,
          unlocksAtTeamMatches,
        });
      }
    }
  }

  const teamMatchesCache = new Map<string, number>([
    [params.proposingTeamId, proposingTeamMatches],
  ]);

  for (const locked of lockedPlayers) {
    if (!locked.tradeLockTeamId || locked.tradeLockUntilTeamMatches === null) {
      continue;
    }
    if (locked.currentTeamId !== locked.tradeLockTeamId) {
      continue;
    }
    let ownerMatches = teamMatchesCache.get(locked.tradeLockTeamId);
    if (ownerMatches === undefined) {
      ownerMatches = await getTeamCompletedMatchesCount(
        db,
        params.leagueId,
        locked.tradeLockTeamId,
      );
      teamMatchesCache.set(locked.tradeLockTeamId, ownerMatches);
    }
    const remainingMatches = locked.tradeLockUntilTeamMatches - ownerMatches;
    if (remainingMatches <= 0 || remainingMatches > acquiredLockMatches) {
      continue;
    }
    const prev = activeByPlayer.get(locked.id);
    if (!prev || remainingMatches >= prev.remainingMatches) {
      activeByPlayer.set(locked.id, {
        reason: 'RECENT_TRADE_ACQUISITION',
        remainingMatches,
        unlocksAtTeamMatches: locked.tradeLockUntilTeamMatches,
        playerName: locked.name,
      });
    }
  }

  if (activeByPlayer.size === 0) {
    return [];
  }

  const missingNameIds = [...activeByPlayer.entries()]
    .filter(([, entry]) => !entry.playerName)
    .map(([playerId]) => playerId);

  const nameById = new Map<string, string>();
  if (missingNameIds.length > 0) {
    const rows = await db.playerInstance.findMany({
      where: {
        leagueId: params.leagueId,
        id: { in: missingNameIds },
      },
      select: { id: true, name: true },
    });
    for (const row of rows) {
      nameById.set(row.id, row.name);
    }
  }

  return [...activeByPlayer.entries()].map(([playerId, info]) => ({
    playerId,
    playerName: info.playerName ?? nameById.get(playerId) ?? 'Jugador',
    reason: info.reason,
    remainingMatches: info.remainingMatches,
    unlocksAtTeamMatches: info.unlocksAtTeamMatches,
  }));
}

export const findActiveRejectionCooldowns = findActiveTransferBlocks;

export async function createAndEvaluateTransferOffer(
  prisma: PrismaClient,
  params: {
    readonly leagueId: string;
    readonly userId: string;
    readonly receivingTeamId: string;
    readonly offeredPlayerIds: readonly string[];
    readonly requestedPlayerIds: readonly string[];
    readonly cashOfferedMillions: number;
    readonly cashRequestedMillions: number;
  },
): Promise<{
  readonly offerId: string;
  readonly status: TransferStatus;
  readonly responseNote: string | null;
}> {
  return prisma.$transaction(async (tx) => {
    const membership = await tx.leagueMember.findUnique({
      where: { leagueId_userId: { leagueId: params.leagueId, userId: params.userId } },
    });
    if (!membership) {
      throw new TransferValidationError('No perteneces a esta liga.', 403);
    }

    if (membership.leagueTeamId === params.receivingTeamId) {
      throw new TransferValidationError('No puedes realizar un traspaso contigo mismo.');
    }

    const activeBlocks = await findActiveTransferBlocks(tx, {
      leagueId: params.leagueId,
      proposingTeamId: membership.leagueTeamId,
      candidatePlayerIds: [...params.offeredPlayerIds, ...params.requestedPlayerIds],
    });
    if (activeBlocks.length > 0) {
      const blockedNames = activeBlocks
        .map((c) => `${c.playerName} (${String(c.remainingMatches)}p)`)
        .join(', ');
      const maxMatches = Math.max(...activeBlocks.map((c) => c.remainingMatches));
      throw new TransferValidationError(
        `Jugadores bloqueados temporalmente (${blockedNames}). Debes esperar ${String(maxMatches)} ${maxMatches === 1 ? 'partido' : 'partidos'}.`,
        409,
      );
    }

    const [league, proposingTeam, receivingTeam, proposingRoster, receivingRoster] =
      await Promise.all([
        tx.league.findUnique({ where: { id: params.leagueId }, select: { gameClockAt: true } }),
        tx.leagueTeam.findFirst({
          where: { id: membership.leagueTeamId, leagueId: params.leagueId },
        }),
        tx.leagueTeam.findFirst({
          where: { id: params.receivingTeamId, leagueId: params.leagueId },
        }),
        tx.playerInstance.findMany({
          where: {
            leagueId: params.leagueId,
            currentTeamId: membership.leagueTeamId,
            isRetired: false,
          },
        }),
        tx.playerInstance.findMany({
          where: {
            leagueId: params.leagueId,
            currentTeamId: params.receivingTeamId,
            isRetired: false,
          },
        }),
      ]);

    if (!proposingTeam || !receivingTeam) {
      throw new TransferValidationError('Equipo destinatario no encontrado en esta liga.', 404);
    }

    const valuation = validateTransferInvariants({
      proposingRoster: proposingRoster.map((p) => ({
        id: p.id,
        position: p.position,
        priceMillions: p.priceMillions,
      })),
      receivingRoster: receivingRoster.map((p) => ({
        id: p.id,
        position: p.position,
        priceMillions: p.priceMillions,
      })),
      proposingBudgetMillions: proposingTeam.budgetMillions,
      receivingBudgetMillions: receivingTeam.budgetMillions,
      offeredPlayerIds: params.offeredPlayerIds,
      requestedPlayerIds: params.requestedPlayerIds,
      cashOfferedMillions: params.cashOfferedMillions,
      cashRequestedMillions: params.cashRequestedMillions,
    });

    const expiresAt = new Date(
      Date.now() + PROVISIONAL_GAME_CONFIG.transfers.offerExpirationHours * 3600_000,
    );

    const createdOffer = await tx.transferOffer.create({
      data: {
        leagueId: params.leagueId,
        proposingTeamId: proposingTeam.id,
        receivingTeamId: receivingTeam.id,
        proposedByUserId: params.userId,
        offeredPlayerIds: [...params.offeredPlayerIds],
        requestedPlayerIds: [...params.requestedPlayerIds],
        cashOfferedMillions: params.cashOfferedMillions,
        cashRequestedMillions: params.cashRequestedMillions,
        status: 'PENDING',
        expiresAt,
      },
    });

    const mailSeasonId = await resolveMailSeasonIdInTx(tx, params.leagueId);
    const offeredNames = proposingRoster
      .filter((p) => params.offeredPlayerIds.includes(p.id))
      .map((p) => p.name);
    const requestedNames = receivingRoster
      .filter((p) => params.requestedPlayerIds.includes(p.id))
      .map((p) => p.name);

    const offerMetadata = {
      offerId: createdOffer.id,
      proposingTeamId: proposingTeam.id,
      proposingTeamName: proposingTeam.name,
      receivingTeamId: receivingTeam.id,
      receivingTeamName: receivingTeam.name,
      offeredPlayers: offeredNames,
      requestedPlayers: requestedNames,
      cashOfferedMillions: params.cashOfferedMillions,
      cashRequestedMillions: params.cashRequestedMillions,
    };

    const offerMails: CreateLeagueMailInput[] = [];
    if (mailSeasonId) {
      offerMails.push({
        leagueId: params.leagueId,
        seasonId: mailSeasonId,
        leagueTeamId: proposingTeam.id,
        roundNumber: null,
        category: 'TRANSFER_SENT',
        subject: `Trade Offer Sent to ${receivingTeam.name}`,
        body: `Sent trade offer to ${receivingTeam.name}: offering ${offeredNames.join(', ')} ($${formatCleanDecimal(params.cashOfferedMillions)}M) for ${requestedNames.join(', ')} ($${formatCleanDecimal(params.cashRequestedMillions)}M).`,
        metadata: offerMetadata,
      });
      if (!receivingTeam.isCpuControlled) {
        offerMails.push({
          leagueId: params.leagueId,
          seasonId: mailSeasonId,
          leagueTeamId: receivingTeam.id,
          roundNumber: null,
          category: 'TRANSFER_RECEIVED',
          subject: `New Trade Proposal from ${proposingTeam.name}`,
          body: `${proposingTeam.name} sent a trade proposal: ${offeredNames.join(', ')} ($${formatCleanDecimal(params.cashOfferedMillions)}M) for ${requestedNames.join(', ')} ($${formatCleanDecimal(params.cashRequestedMillions)}M).`,
          metadata: offerMetadata,
        });
      }
    }

    if (receivingTeam.isCpuControlled) {
      const cpuMinRatio = PROVISIONAL_GAME_CONFIG.economyAndMarket.cpuAcceptMinRatio;
      const requestedList = requestedNames.join(', ');
      if (valuation.ratio + 0.001 >= cpuMinRatio) {
        await recordHumanTeamMailsInTx(tx, offerMails);
        const note = `¡Enhorabuena! Los ${receivingTeam.name} han aceptado tu oferta por ${requestedList}.`;
        await executeAcceptedTransferInTx(tx, {
          leagueId: params.leagueId,
          offerId: createdOffer.id,
          idempotencyKey: `cpu-auto-${createdOffer.id}-${randomUUID()}`,
          responseNote: note,
        });
        return { offerId: createdOffer.id, status: 'ACCEPTED', responseNote: note };
      }

      const proposingTeamMatches = await getTeamCompletedMatchesCount(
        tx,
        params.leagueId,
        proposingTeam.id,
      );
      const rejectNote = `Los ${receivingTeam.name} han rechazado tu oferta por ${requestedList} (valoración del ${String(Math.round(valuation.ratio * 100))}%, mínimo ${String(Math.round(cpuMinRatio * 100))}%). Tanto el jugador propuesto como el solicitado descansarán 1 partido.`;
      await tx.transferOffer.update({
        where: { id: createdOffer.id },
        data: {
          status: 'REJECTED',
          responseNote: rejectNote,
          respondedAt: new Date(),
          rejectedGameClockAt: league?.gameClockAt ?? new Date(),
          rejectedAtTeamMatches: proposingTeamMatches,
        },
      });
      if (mailSeasonId) {
        offerMails.push({
          leagueId: params.leagueId,
          seasonId: mailSeasonId,
          leagueTeamId: proposingTeam.id,
          roundNumber: null,
          category: 'TRANSFER_REJECTED',
          subject: `Trade Offer Rejected by ${receivingTeam.name}`,
          body: `${receivingTeam.name} rejected your offer for ${requestedList}. Both offered and requested players face a 1-match cooldown.`,
          metadata: { ...offerMetadata, responseNote: rejectNote },
        });
      }
      await recordHumanTeamMailsInTx(tx, offerMails);
      return { offerId: createdOffer.id, status: 'REJECTED', responseNote: rejectNote };
    }

    await recordHumanTeamMailsInTx(tx, offerMails);
    return { offerId: createdOffer.id, status: 'PENDING', responseNote: null };
  });
}

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Ejecuta traspasos autónomos CPU ↔ CPU y genera propuestas CPU → mánager humano
 * respetando 18 jugadores, 5 posiciones, regla del 50%, presupuestos y bloqueos por partido.
 */
export async function runAutonomousCpuTransfersInTx(
  tx: Prisma.TransactionClient,
  params: {
    readonly leagueId: string;
    readonly seasonId: string;
    readonly roundNumber: number;
  },
): Promise<{
  readonly cpuToCpuExecutedCount: number;
  readonly cpuToHumanProposedCount: number;
}> {
  const rng = createSeededRng(
    `${params.leagueId}:s${params.seasonId}:r${String(params.roundNumber)}:cpu-trades`,
  );
  const rejectionCooldownMatches = PROVISIONAL_GAME_CONFIG.transfers.rejectionCooldownMatches;

  const [teams, players, pendingOffers, recentRejected, finalMatches] = await Promise.all([
    tx.leagueTeam.findMany({
      where: { leagueId: params.leagueId },
      orderBy: { code: 'asc' },
    }),
    tx.playerInstance.findMany({
      where: { leagueId: params.leagueId, isRetired: false },
      orderBy: { priceMillions: 'desc' },
    }),
    tx.transferOffer.findMany({
      where: { leagueId: params.leagueId, status: 'PENDING' },
    }),
    tx.transferOffer.findMany({
      where: {
        leagueId: params.leagueId,
        status: 'REJECTED',
        rejectedAtTeamMatches: { not: null },
      },
      orderBy: { respondedAt: 'desc' },
      take: 150,
    }),
    tx.match.findMany({
      where: { leagueId: params.leagueId, status: 'FINAL' },
      select: { homeTeamId: true, awayTeamId: true },
    }),
  ]);

  const completedMatchesByTeam = new Map<string, number>();
  for (const m of finalMatches) {
    completedMatchesByTeam.set(m.homeTeamId, (completedMatchesByTeam.get(m.homeTeamId) ?? 0) + 1);
    completedMatchesByTeam.set(m.awayTeamId, (completedMatchesByTeam.get(m.awayTeamId) ?? 0) + 1);
  }

  const pendingPlayerIds = new Set<string>();
  const pendingTeamPairs = new Set<string>();
  const pendingIncomingByTeam = new Map<string, number>();
  for (const offer of pendingOffers) {
    pendingTeamPairs.add(`${offer.proposingTeamId}::${offer.receivingTeamId}`);
    pendingIncomingByTeam.set(
      offer.receivingTeamId,
      (pendingIncomingByTeam.get(offer.receivingTeamId) ?? 0) + 1,
    );
    for (const id of offer.offeredPlayerIds) {
      pendingPlayerIds.add(id);
    }
    for (const id of offer.requestedPlayerIds) {
      pendingPlayerIds.add(id);
    }
  }

  const rejectedBlockedByTeam = new Map<string, Set<string>>();
  const acquiredLockMatches = PROVISIONAL_GAME_CONFIG.transfers.acquiredPlayerLockMatches;
  for (const rej of recentRejected) {
    if (rej.rejectedAtTeamMatches === null) {
      continue;
    }
    const teamMatches = completedMatchesByTeam.get(rej.proposingTeamId) ?? 0;
    if (
      rej.rejectedAtTeamMatches <= teamMatches &&
      teamMatches < rej.rejectedAtTeamMatches + rejectionCooldownMatches
    ) {
      const set = rejectedBlockedByTeam.get(rej.proposingTeamId) ?? new Set<string>();
      for (const pid of [...rej.offeredPlayerIds, ...rej.requestedPlayerIds]) {
        set.add(pid);
      }
      rejectedBlockedByTeam.set(rej.proposingTeamId, set);
    }
  }

  const isBlockedForTeam = (teamId: string, player: (typeof players)[number]): boolean => {
    if (pendingPlayerIds.has(player.id)) {
      return true;
    }
    if (
      player.tradeLockTeamId === player.currentTeamId &&
      player.tradeLockUntilTeamMatches !== null
    ) {
      const ownerMatches = completedMatchesByTeam.get(player.currentTeamId) ?? 0;
      const remaining = player.tradeLockUntilTeamMatches - ownerMatches;
      if (remaining > 0 && remaining <= acquiredLockMatches) {
        return true;
      }
    }
    return rejectedBlockedByTeam.get(teamId)?.has(player.id) ?? false;
  };

  const rosterByTeam = new Map<string, (typeof players)[number][]>();
  for (const p of players) {
    const list = rosterByTeam.get(p.currentTeamId) ?? [];
    list.push(p);
    rosterByTeam.set(p.currentTeamId, list);
  }

  const findSwapPair = (
    teamA: (typeof teams)[number],
    teamB: (typeof teams)[number],
    opts: {
      readonly allowCash: boolean;
      readonly minRatio: number;
      readonly maxRatio: number;
    },
  ): {
    readonly outPlayer: (typeof players)[number];
    readonly inPlayer: (typeof players)[number];
    readonly cashOffered: number;
    readonly cashRequested: number;
  } | null => {
    const rosterA = rosterByTeam.get(teamA.id) ?? [];
    const rosterB = rosterByTeam.get(teamB.id) ?? [];
    if (rosterA.length !== LEAGUE_RULES.squadSize || rosterB.length !== LEAGUE_RULES.squadSize) {
      return null;
    }

    const countPositions = (roster: readonly (typeof players)[number][]) => {
      const counts = new Map<Position, number>();
      for (const p of roster) {
        counts.set(p.position, (counts.get(p.position) ?? 0) + 1);
      }
      return counts;
    };
    const posCountsA = countPositions(rosterA);
    const posCountsB = countPositions(rosterB);

    const eligibleA = rng
      .shuffle(
        rosterA.filter(
          (p) =>
            !isBlockedForTeam(teamA.id, p) &&
            !isBlockedForTeam(teamB.id, p) &&
            p.status !== 'INJURED' &&
            p.status !== 'SUSPENDED' &&
            p.priceMillions >= 4.5,
        ),
      )
      .slice(0, 8);
    const eligibleB = rng
      .shuffle(
        rosterB.filter(
          (p) =>
            !isBlockedForTeam(teamA.id, p) &&
            !isBlockedForTeam(teamB.id, p) &&
            p.status !== 'INJURED' &&
            p.status !== 'SUSPENDED' &&
            p.priceMillions >= 4.5,
        ),
      )
      .slice(0, 8);

    for (const pOut of eligibleA) {
      for (const pIn of eligibleB) {
        const samePos = pOut.position === pIn.position;
        if (!samePos) {
          if ((posCountsA.get(pOut.position) ?? 0) < 2) {
            continue;
          }
          if ((posCountsB.get(pIn.position) ?? 0) < 2) {
            continue;
          }
        }
        const rawGap = Math.abs(pIn.priceMillions - pOut.priceMillions);
        if (rawGap > (opts.allowCash ? 10.5 : 3.6)) {
          continue;
        }

        let cashOffered = 0;
        let cashRequested = 0;
        if (opts.allowCash && rawGap >= 0.9) {
          const stepCash = Math.min(9.0, Math.max(0.1, roundToTenth(rawGap)));
          if (pIn.priceMillions > pOut.priceMillions) {
            const maxSafeCash = roundToTenth(Math.max(0, teamA.budgetMillions - 6.0));
            if (maxSafeCash >= 0.1) {
              cashOffered = Math.min(stepCash, maxSafeCash);
            }
          } else {
            const maxSafeCash = roundToTenth(Math.max(0, teamB.budgetMillions - 6.0));
            if (maxSafeCash >= 0.1) {
              cashRequested = Math.min(stepCash, maxSafeCash);
            }
          }
        }

        try {
          const val = validateTransferInvariants({
            proposingRoster: rosterA,
            receivingRoster: rosterB,
            proposingBudgetMillions: teamA.budgetMillions,
            receivingBudgetMillions: teamB.budgetMillions,
            offeredPlayerIds: [pOut.id],
            requestedPlayerIds: [pIn.id],
            cashOfferedMillions: cashOffered,
            cashRequestedMillions: cashRequested,
          });
          if (val.ratio >= opts.minRatio && val.ratio <= opts.maxRatio) {
            return { outPlayer: pOut, inPlayer: pIn, cashOffered, cashRequested };
          }
        } catch {
          // Si incumple invariante salarial o posicional, continuamos buscando pareja
        }
      }
    }
    return null;
  };

  let cpuToCpuExecutedCount = 0;
  let cpuToHumanProposedCount = 0;
  const usedTeamsThisRound = new Set<string>();
  const cpuTeams = rng.shuffle(teams.filter((t) => t.isCpuControlled));
  const humanTeams = teams.filter((t) => !t.isCpuControlled);

  // 1) Traspasos autónomos estrictamente CPU ↔ CPU (nunca originados por usuarios humanos)
  const targetCpuTrades = params.roundNumber === 1 ? 1 : rng.nextInt(1, 2);
  const allowCashForCpuSwaps = params.roundNumber >= 2;
  for (let i = 0; i < cpuTeams.length && cpuToCpuExecutedCount < targetCpuTrades; i += 1) {
    const teamA = cpuTeams[i];
    if (!teamA || !teamA.isCpuControlled || usedTeamsThisRound.has(teamA.id)) {
      continue;
    }
    for (let j = i + 1; j < cpuTeams.length; j += 1) {
      const teamB = cpuTeams[j];
      if (!teamB || !teamB.isCpuControlled || usedTeamsThisRound.has(teamB.id)) {
        continue;
      }
      const swap = findSwapPair(teamA, teamB, {
        allowCash: allowCashForCpuSwaps,
        minRatio: 0.94,
        maxRatio: 1.08,
      });
      if (!swap) {
        continue;
      }

      const offer = await tx.transferOffer.create({
        data: {
          leagueId: params.leagueId,
          proposingTeamId: teamA.id,
          receivingTeamId: teamB.id,
          proposedByUserId: null,
          offeredPlayerIds: [swap.outPlayer.id],
          requestedPlayerIds: [swap.inPlayer.id],
          cashOfferedMillions: swap.cashOffered,
          cashRequestedMillions: swap.cashRequested,
          status: 'PENDING',
          expiresAt: new Date(
            Date.now() + PROVISIONAL_GAME_CONFIG.transfers.offerExpirationHours * 3600_000,
          ),
        },
      });

      await executeAcceptedTransferInTx(tx, {
        leagueId: params.leagueId,
        offerId: offer.id,
        idempotencyKey: `cpu-swap-${params.leagueId}-r${String(params.roundNumber)}-${teamA.code}-${teamB.code}-${randomUUID()}`,
        responseNote: `Acuerdo de traspaso entre ${teamA.name} y ${teamB.name}.`,
      });

      usedTeamsThisRound.add(teamA.id);
      usedTeamsThisRound.add(teamB.id);
      pendingPlayerIds.add(swap.outPlayer.id);
      pendingPlayerIds.add(swap.inPlayer.id);
      cpuToCpuExecutedCount += 1;
      break;
    }
  }

  // 2) Propuestas entrantes estrictamente CPU → Mánager humano (un usuario humano solo recibe propuestas, nunca envía automáticas)
  const incomingMailQueue: CreateLeagueMailInput[] = [];
  for (const humanTeam of humanTeams) {
    if (humanTeam.isCpuControlled) {
      continue;
    }
    const openIncoming = pendingIncomingByTeam.get(humanTeam.id) ?? 0;
    if (openIncoming >= 2) {
      continue;
    }
    if (openIncoming === 1 && rng.nextInt(1, 100) > 45) {
      continue;
    }

    for (const cpuTeam of cpuTeams) {
      if (!cpuTeam.isCpuControlled || usedTeamsThisRound.has(cpuTeam.id)) {
        continue;
      }
      if (pendingTeamPairs.has(`${cpuTeam.id}::${humanTeam.id}`)) {
        continue;
      }

      const proposal = findSwapPair(cpuTeam, humanTeam, {
        allowCash: true,
        minRatio: 0.96,
        maxRatio: 1.16,
      });
      if (!proposal) {
        continue;
      }

      const createdProposal = await tx.transferOffer.create({
        data: {
          leagueId: params.leagueId,
          proposingTeamId: cpuTeam.id,
          receivingTeamId: humanTeam.id,
          proposedByUserId: null,
          offeredPlayerIds: [proposal.outPlayer.id],
          requestedPlayerIds: [proposal.inPlayer.id],
          cashOfferedMillions: proposal.cashOffered,
          cashRequestedMillions: proposal.cashRequested,
          status: 'PENDING',
          responseNote: `Los ${cpuTeam.name} te proponen un intercambio equilibrado.`,
          expiresAt: new Date(
            Date.now() + PROVISIONAL_GAME_CONFIG.transfers.offerExpirationHours * 3600_000,
          ),
        },
      });

      incomingMailQueue.push({
        leagueId: params.leagueId,
        seasonId: params.seasonId,
        leagueTeamId: humanTeam.id,
        roundNumber: params.roundNumber,
        category: 'TRANSFER_RECEIVED',
        subject: `Incoming CPU Proposal from ${cpuTeam.name}`,
        body: `${cpuTeam.name} proposed a trade: ${proposal.outPlayer.name} ($${formatCleanDecimal(proposal.cashOffered)}M) for your ${proposal.inPlayer.name} ($${formatCleanDecimal(proposal.cashRequested)}M).`,
        metadata: {
          offerId: createdProposal.id,
          proposingTeamId: cpuTeam.id,
          proposingTeamName: cpuTeam.name,
          receivingTeamId: humanTeam.id,
          receivingTeamName: humanTeam.name,
          offeredPlayers: [proposal.outPlayer.name],
          requestedPlayers: [proposal.inPlayer.name],
          cashOfferedMillions: proposal.cashOffered,
          cashRequestedMillions: proposal.cashRequested,
        },
      });

      pendingPlayerIds.add(proposal.outPlayer.id);
      pendingPlayerIds.add(proposal.inPlayer.id);
      pendingTeamPairs.add(`${cpuTeam.id}::${humanTeam.id}`);
      usedTeamsThisRound.add(cpuTeam.id);
      cpuToHumanProposedCount += 1;
      break;
    }
  }

  await recordHumanTeamMailsInTx(tx, incomingMailQueue);

  return { cpuToCpuExecutedCount, cpuToHumanProposedCount };
}
