import {
  localizeTransferResponseNote,
  type AppLanguage,
  type AvailabilityStatus as SharedAvailability,
  type LeagueRole as SharedLeagueRole,
  type LeagueStatus as SharedLeagueStatus,
  type MatchFixtureDto,
  type PlayerInstanceDto,
  type PlayerRole as SharedRole,
  type StandingEntryDto,
  type TransferOfferDto,
  type TransferStatus as SharedTransferStatus,
} from '@dream5/shared';

import { getLocaleCode } from '@/lib/i18n';

import type {
  AvailabilityStatus,
  LeagueRole,
  LeagueStatus,
  MatchFixture,
  Player,
  PlayerRole,
  StandingEntry,
  TradeOffer,
} from '@/types/fantasy';

export const ROLE_TO_UI: Record<SharedRole, PlayerRole> = {
  SUPERSTAR: 'Superestrella',
  STAR: 'Estrella',
  STARTER: 'Inicial',
  ROTATION: 'Rotación',
  ROOKIE: 'Rookie',
  BENCH: 'Calientabanquillos',
};

export const AVAILABILITY_TO_UI: Record<SharedAvailability, AvailabilityStatus> = {
  HEALTHY: 'Healthy',
  QUESTIONABLE: 'Questionable',
  INJURED: 'Injured',
  SUSPENDED: 'Suspended',
};

export function toUiRole(role: SharedRole | PlayerRole): PlayerRole {
  return role in ROLE_TO_UI ? ROLE_TO_UI[role as SharedRole] : (role as PlayerRole);
}

export function toUiAvailability(
  status: SharedAvailability | AvailabilityStatus,
): AvailabilityStatus {
  return status in AVAILABILITY_TO_UI
    ? AVAILABILITY_TO_UI[status as SharedAvailability]
    : (status as AvailabilityStatus);
}

const LEAGUE_ROLE_TO_UI: Record<SharedLeagueRole, LeagueRole> = {
  PRESIDENT: 'Presidente',
  MEMBER: 'Miembro',
};

const LEAGUE_STATUS_TO_UI: Record<SharedLeagueStatus, LeagueStatus> = {
  ACTIVE: 'En curso',
  COMPLETED: 'Finalizada',
};

export const UI_ROLE_TO_SHARED: Record<PlayerRole, SharedRole> = {
  Superestrella: 'SUPERSTAR',
  Estrella: 'STAR',
  Inicial: 'STARTER',
  Rotación: 'ROTATION',
  Rookie: 'ROOKIE',
  Calientabanquillos: 'BENCH',
};

export const UI_AVAILABILITY_TO_SHARED: Record<AvailabilityStatus, SharedAvailability> = {
  Healthy: 'HEALTHY',
  Questionable: 'QUESTIONABLE',
  Injured: 'INJURED',
  Suspended: 'SUSPENDED',
};

export function mapLeagueRoleToUi(role: SharedLeagueRole): LeagueRole {
  return LEAGUE_ROLE_TO_UI[role];
}

export function mapLeagueStatusToUi(status: SharedLeagueStatus): LeagueStatus {
  return LEAGUE_STATUS_TO_UI[status];
}

export function mapPlayerDtoToUi(dto: PlayerInstanceDto): Player {
  const fpPerGame =
    dto.seasonGamesPlayed > 0
      ? Math.round((dto.seasonFantasyPoints / dto.seasonGamesPlayed) * 10) / 10
      : 0;
  const trend: 'up' | 'down' | 'neutral' =
    dto.priceDeltaMillions > 0.05 ? 'up' : dto.priceDeltaMillions < -0.05 ? 'down' : 'neutral';

  return {
    id: dto.id,
    name: dto.name,
    initials: dto.initials,
    position: dto.position,
    role: ROLE_TO_UI[dto.role],
    age: dto.age,
    teamId: dto.currentTeamId,
    teamAbbr: dto.teamCode,
    teamName: dto.teamName,
    priceMillions: dto.priceMillions,
    priceDeltaMillions: dto.priceDeltaMillions,
    status: AVAILABILITY_TO_UI[dto.status],
    ...(dto.statusNote ? { statusNote: dto.statusNote } : {}),
    stats: {
      pts: dto.seasonPtsAvg,
      reb: dto.seasonRebAvg,
      ast: dto.seasonAstAvg,
      stl: 1.0,
      blk: 0.6,
      tov: 1.8,
      pf: 2.1,
      min: dto.seasonGamesPlayed > 0 ? 24 : 0,
      fpPerGame,
      recentTrend: trend,
    },
  };
}

export function mapStandingDtoToUi(dto: StandingEntryDto): StandingEntry {
  return {
    rank: dto.rank,
    teamId: dto.leagueTeamId,
    teamName: dto.teamName,
    teamAbbr: dto.teamCode,
    isCpuControlled: dto.isCpuControlled,
    managerHandle: dto.managerUsername ?? 'CPU',
    managerAvatarUrl: dto.isCpuControlled ? null : dto.managerAvatarUrl,
    fantasyPoints: dto.fantasyPoints,
    lastFive: dto.lastFive,
    isUserTeam: dto.isUserTeam,
  };
}

export function mapMatchDtoToUi(dto: MatchFixtureDto, language: AppLanguage = 'en'): MatchFixture {
  const d = new Date(dto.scheduledAt);
  const locale = getLocaleCode(language);
  const roundPrefix = language === 'es' ? 'J' : 'R';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const dateLabel = `${roundPrefix}${String(dto.roundNumber)} · ${day}/${month}`;
  const timeLabel = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);

  return {
    id: dto.id,
    dateLabel,
    timeLabel,
    status: dto.status === 'FINAL' ? 'FINAL' : 'PROGRAMADO',
    homeAbbr: dto.homeTeamCode,
    homeName: dto.homeTeamName,
    ...(dto.homeScore !== null ? { homeScore: dto.homeScore } : {}),
    awayAbbr: dto.awayTeamCode,
    awayName: dto.awayTeamName,
    ...(dto.awayScore !== null ? { awayScore: dto.awayScore } : {}),
    winRewardMillions: dto.winRewardMillions ?? null,
  };
}

function mapTransferStatus(status: SharedTransferStatus): TradeOffer['status'] {
  if (status === 'ACCEPTED') return 'Aceptada';
  if (status === 'PENDING') return 'Pendiente';
  return 'Rechazada';
}

export function mapTransferOfferDtoToUi(
  dto: TransferOfferDto,
  userTeamId: string,
  language: AppLanguage = 'en',
): TradeOffer {
  const isIncoming = dto.receivingTeamId === userTeamId;
  const isOutgoing = dto.proposingTeamId === userTeamId;
  const isHistory = dto.status !== 'PENDING' || (!isIncoming && !isOutgoing);
  const bucket: TradeOffer['bucket'] = isHistory ? 'history' : isIncoming ? 'incoming' : 'outgoing';

  const dateObj = new Date(dto.createdAt);
  const dateLabel = dateObj.toLocaleString(getLocaleCode(language), {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

  const handleLabel =
    dto.isProposingCpu && isIncoming
      ? language === 'es'
        ? 'CPU · Recibida'
        : 'CPU · Incoming'
      : dto.isReceivingCpu && !isIncoming
        ? 'CPU'
        : isIncoming
          ? language === 'es'
            ? 'Recibida'
            : 'Incoming'
          : language === 'es'
            ? 'Enviada'
            : 'Outgoing';

  return {
    id: dto.id,
    bucket,
    counterpartyHandle: handleLabel,
    counterpartyTeam: isIncoming
      ? `${dto.proposingTeamName} (${dto.proposingTeamCode})`
      : `${dto.receivingTeamName} (${dto.receivingTeamCode})`,
    counterpartyCode: isIncoming ? dto.proposingTeamCode : dto.receivingTeamCode,
    dateLabel: dto.responseNote
      ? `${dateLabel} · ${localizeTransferResponseNote(dto.responseNote, language)}`
      : dateLabel,
    offeredPlayers: (isIncoming ? dto.requestedPlayers : dto.offeredPlayers).map((p) => ({
      id: p.id,
      name: p.name,
      position: p.position,
      role: ROLE_TO_UI[p.role],
      priceMillions: p.priceMillions,
    })),
    requestedPlayers: (isIncoming ? dto.offeredPlayers : dto.requestedPlayers).map((p) => ({
      id: p.id,
      name: p.name,
      position: p.position,
      role: ROLE_TO_UI[p.role],
      priceMillions: p.priceMillions,
    })),
    cashOfferedMillions: isIncoming ? dto.cashRequestedMillions : dto.cashOfferedMillions,
    cashRequestedMillions: isIncoming ? dto.cashOfferedMillions : dto.cashRequestedMillions,
    status: mapTransferStatus(dto.status),
  };
}
