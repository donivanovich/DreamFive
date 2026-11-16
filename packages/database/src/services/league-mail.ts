import { randomUUID } from 'node:crypto';
import type { LeagueMailCategory } from '@dream5/shared';
import type { Prisma, PrismaClient } from '../generated/prisma/client.js';

export type LeagueMailDbClient = Prisma.TransactionClient | PrismaClient;

export interface CreateLeagueMailInput {
  readonly leagueId: string;
  readonly seasonId: string;
  readonly leagueTeamId: string;
  readonly roundNumber?: number | null;
  readonly category: LeagueMailCategory;
  readonly subject: string;
  readonly body: string;
  readonly metadata?: Record<string, unknown> | null;
}

/**
 * Inserta correos solo para equipos controlados por humanos (`isCpuControlled === false`).
 * La CPU nunca necesita bandeja persistente, ahorrando espacio en base de datos.
 */
export async function recordHumanTeamMailsInTx(
  tx: LeagueMailDbClient,
  mails: readonly CreateLeagueMailInput[],
): Promise<void> {
  if (mails.length === 0) {
    return;
  }

  const teamIds = [...new Set(mails.map((mail) => mail.leagueTeamId))];
  const humanTeams = await tx.leagueTeam.findMany({
    where: {
      id: { in: teamIds },
      isCpuControlled: false,
    },
    select: { id: true },
  });
  const humanTeamIds = new Set(humanTeams.map((team) => team.id));
  const filtered = mails.filter((mail) => humanTeamIds.has(mail.leagueTeamId));
  if (filtered.length === 0) {
    return;
  }

  await tx.leagueMail.createMany({
    data: filtered.map((mail) => ({
      id: randomUUID(),
      leagueId: mail.leagueId,
      seasonId: mail.seasonId,
      leagueTeamId: mail.leagueTeamId,
      roundNumber: mail.roundNumber ?? null,
      category: mail.category,
      subject: mail.subject,
      body: mail.body,
      metadataJson: (mail.metadata ?? null) as Prisma.InputJsonValue,
      isRead: false,
    })),
  });
}

/**
 * Resuelve el `seasonId` activo (o el más reciente) de una liga para asociar avisos.
 */
export async function resolveMailSeasonIdInTx(
  tx: LeagueMailDbClient,
  leagueId: string,
): Promise<string | null> {
  const active = await tx.season.findFirst({
    where: { leagueId, status: 'ACTIVE' },
    orderBy: { seasonNumber: 'desc' },
    select: { id: true },
  });
  if (active) {
    return active.id;
  }
  const latest = await tx.season.findFirst({
    where: { leagueId },
    orderBy: { seasonNumber: 'desc' },
    select: { id: true },
  });
  return latest?.id ?? null;
}

export function buildMatchResultMailInput(params: {
  readonly leagueId: string;
  readonly seasonId: string;
  readonly leagueTeamId: string;
  readonly roundNumber: number;
  readonly opponentTeamId: string;
  readonly opponentTeamName: string;
  readonly opponentTeamCode: string;
  readonly isHome: boolean;
  readonly teamScore: number;
  readonly opponentScore: number;
  readonly won: boolean;
  readonly overtimeCount: number;
  readonly teamDreamPoints: number;
  readonly winRewardMillions: number;
}): CreateLeagueMailInput {
  const venueLabel = params.isHome ? 'vs' : '@';
  const otSuffix = params.overtimeCount > 0 ? ` (${String(params.overtimeCount)}OT)` : '';
  const outcomeLabel = params.won ? 'Victory' : 'Defeat';
  const rewardUsd = Math.round(params.winRewardMillions * 1_000_000);
  const rewardLine =
    params.won && rewardUsd > 0
      ? ` Win reward credited: $${rewardUsd.toLocaleString('en-US')}.`
      : '';

  return {
    leagueId: params.leagueId,
    seasonId: params.seasonId,
    leagueTeamId: params.leagueTeamId,
    roundNumber: params.roundNumber,
    category: 'MATCH_RESULT',
    subject: `Round ${String(params.roundNumber)}: ${outcomeLabel} ${venueLabel} ${params.opponentTeamName} (${String(params.teamScore)}-${String(params.opponentScore)}${otSuffix})`,
    body: `Your club finished Round ${String(params.roundNumber)} ${venueLabel} ${params.opponentTeamName} with a score of ${String(params.teamScore)}-${String(params.opponentScore)}${otSuffix} and generated ${params.teamDreamPoints.toFixed(1)} Dream Points.${rewardLine}`,
    metadata: {
      roundNumber: params.roundNumber,
      opponentTeamId: params.opponentTeamId,
      opponentTeamName: params.opponentTeamName,
      opponentTeamCode: params.opponentTeamCode,
      isHome: params.isHome,
      teamScore: params.teamScore,
      opponentScore: params.opponentScore,
      won: params.won,
      overtimeCount: params.overtimeCount,
      teamDreamPoints: Number(params.teamDreamPoints.toFixed(2)),
      winRewardMillions: Number(params.winRewardMillions.toFixed(3)),
    },
  };
}

export function buildRetirementReplacementMailInput(params: {
  readonly leagueId: string;
  readonly seasonId: string;
  readonly leagueTeamId: string;
  readonly seasonNumber: number;
  readonly teamName: string;
  readonly retiredPlayerName: string;
  readonly retiredAge: number;
  readonly retiredPosition: string;
  readonly retiredOverall: number;
  readonly rookiePlayerId: string;
  readonly rookiePlayerName: string;
  readonly rookieAge: number;
  readonly rookiePosition: string;
  readonly rookieOverall: number;
  readonly rookiePriceMillions: number;
}): CreateLeagueMailInput {
  return {
    leagueId: params.leagueId,
    seasonId: params.seasonId,
    leagueTeamId: params.leagueTeamId,
    roundNumber: null,
    category: 'RETIREMENT_REPLACEMENT',
    subject: `Retirement & Rookie Sign-Off (${params.teamName}): ${params.retiredPlayerName} -> ${params.rookiePlayerName}`,
    body: `${params.retiredPlayerName} (${params.retiredPosition}, age ${String(params.retiredAge)}, OVR ${String(params.retiredOverall)}) has officially retired after last season. Your franchise promoted rookie ${params.rookiePlayerName} (${params.rookiePosition}, age ${String(params.rookieAge)}, OVR ${String(params.rookieOverall)}, $${params.rookiePriceMillions.toFixed(1)}M) to keep your 18-player roster complete for Season ${String(params.seasonNumber)}.`,
    metadata: {
      seasonNumber: params.seasonNumber,
      teamName: params.teamName,
      retiredPlayerName: params.retiredPlayerName,
      retiredAge: params.retiredAge,
      retiredPosition: params.retiredPosition,
      retiredOverall: params.retiredOverall,
      rookiePlayerId: params.rookiePlayerId,
      rookiePlayerName: params.rookiePlayerName,
      rookieAge: params.rookieAge,
      rookiePosition: params.rookiePosition,
      rookieOverall: params.rookieOverall,
      rookiePriceMillions: Number(params.rookiePriceMillions.toFixed(2)),
    },
  };
}

export function buildPresidentPromotionMailInput(params: {
  readonly leagueId: string;
  readonly seasonId: string;
  readonly leagueTeamId: string;
  readonly leagueName: string;
  readonly previousPresidentName: string;
  readonly newPresidentName: string;
  readonly teamName: string;
}): CreateLeagueMailInput {
  return {
    leagueId: params.leagueId,
    seasonId: params.seasonId,
    leagueTeamId: params.leagueTeamId,
    roundNumber: null,
    category: 'PRESIDENT_PROMOTION',
    subject: `¡Enhorabuena, ahora eres presidente de la liga ${params.leagueName}!`,
    body: `${params.previousPresidentName} ha abandonado DREAM5 y te ha designado como nuevo presidente de ${params.leagueName}. Como nuevo máximo responsable de ${params.teamName}, ya puedes invitar a nuevos mánagers y liderar la liga.`,
    metadata: {
      leagueName: params.leagueName,
      previousPresidentName: params.previousPresidentName,
      newPresidentName: params.newPresidentName,
      teamName: params.teamName,
    },
  };
}
