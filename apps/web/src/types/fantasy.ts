/**
 * Tipos de dominio para la interfaz visual de DREAM5.
 *
 * Representan el modelo conceptual del juego sobre datos de ejemplo (mocks).
 * No sustituyen al futuro contrato definitivo de la API ni al esquema Prisma.
 */

export const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'] as const;
export type Position = (typeof POSITIONS)[number];

export const PLAYER_ROLES = [
  'Superestrella',
  'Estrella',
  'Inicial',
  'Rotación',
  'Rookie',
  'Calientabanquillos',
] as const;
export type PlayerRole = (typeof PLAYER_ROLES)[number];

export const AVAILABILITY_STATUSES = ['Healthy', 'Questionable', 'Injured', 'Suspended'] as const;
export type AvailabilityStatus = (typeof AVAILABILITY_STATUSES)[number];

export type LeagueRole = 'Presidente' | 'Miembro';
export type LeagueStatus = 'En curso' | 'Pretemporada' | 'Finalizada';

export type LineupMap = Record<Position, string | null>;

export interface PlayerStats {
  readonly pts: number;
  readonly reb: number;
  readonly ast: number;
  readonly stl: number;
  readonly blk: number;
  readonly tov: number;
  readonly pf: number;
  readonly min: number;
  /** Puntos fantasy medios de ejemplo (fórmula oficial pendiente de definir). */
  readonly fpPerGame: number;
  readonly recentTrend: 'up' | 'down' | 'neutral';
}

export interface Player {
  readonly id: string;
  readonly name: string;
  readonly initials: string;
  readonly position: Position;
  readonly role: PlayerRole;
  readonly age: number;
  readonly teamId: string;
  readonly teamAbbr: string;
  readonly teamName: string;
  readonly priceMillions: number;
  readonly priceDeltaMillions: number;
  readonly status: AvailabilityStatus;
  readonly statusNote?: string;
  readonly stats: PlayerStats;
}

export interface StandingEntry {
  readonly rank: number;
  readonly teamId: string;
  readonly teamName: string;
  readonly teamAbbr: string;
  readonly isCpuControlled: boolean;
  readonly managerHandle: string;
  readonly managerAvatarUrl?: string | null;
  readonly fantasyPoints: number;
  readonly lastFive: readonly ('W' | 'L')[];
  readonly isUserTeam?: boolean;
}

export interface MatchFixture {
  readonly id: string;
  readonly dateLabel: string;
  readonly timeLabel: string;
  readonly status: 'PROGRAMADO' | 'FINAL';
  readonly homeAbbr: string;
  readonly homeName: string;
  readonly homeScore?: number;
  readonly awayAbbr: string;
  readonly awayName: string;
  readonly awayScore?: number;
  readonly winRewardMillions?: number | null;
}

export interface TeamBoxScoreRow {
  readonly label: string;
  readonly homeValue: string;
  readonly awayValue: string;
}

export interface TeamBoxScore {
  readonly matchLabel: string;
  readonly dateLabel: string;
  readonly homeAbbr: string;
  readonly homeName: string;
  readonly homeScore: number;
  readonly awayAbbr: string;
  readonly awayName: string;
  readonly awayScore: number;
  readonly rows: readonly TeamBoxScoreRow[];
}

export interface IndividualPerformance {
  readonly id: string;
  readonly playerName: string;
  readonly teamAbbr: string;
  readonly position: Position;
  readonly pts: number;
  readonly reb: number;
  readonly ast: number;
  readonly stl: number;
  readonly blk: number;
  readonly tov: number;
  readonly pf: number;
  readonly min: number;
  readonly fp: number;
}

export interface TradePlayerRef {
  readonly id: string;
  readonly name: string;
  readonly position: Position;
  readonly role: PlayerRole;
  readonly priceMillions: number;
}

export interface TradeOffer {
  readonly id: string;
  readonly bucket: 'incoming' | 'outgoing' | 'history';
  readonly counterpartyHandle: string;
  readonly counterpartyTeam: string;
  readonly counterpartyCode: string;
  readonly dateLabel: string;
  readonly offeredPlayers: readonly TradePlayerRef[];
  readonly requestedPlayers: readonly TradePlayerRef[];
  readonly cashOfferedMillions: number;
  readonly cashRequestedMillions: number;
  readonly status: 'Pendiente' | 'Aceptada' | 'Rechazada';
}

export interface LeagueData {
  readonly id: string;
  readonly name: string;
  readonly season: string;
  readonly participantsCount: number;
  readonly maxParticipants: 30;
  readonly userRole: LeagueRole;
  readonly status: LeagueStatus;
  readonly userTeamId: string;
  readonly userTeamName: string;
  readonly userTeamAbbr: string;
  readonly userRank: number;
  readonly userTotalFp: number;
  readonly userLastMatchdayFp: number;
  readonly userAvgFp: number;
  readonly userBudgetMillions: number;
  readonly defaultLineup: LineupMap;
  readonly roster: readonly Player[];
  readonly directoryPlayers: readonly Player[];
  readonly standings: readonly StandingEntry[];
  readonly upcomingMatches: readonly MatchFixture[];
  readonly recentMatches: readonly MatchFixture[];
  readonly featuredBoxScore: TeamBoxScore;
  readonly topPerformances: readonly IndividualPerformance[];
  readonly tradeOffers: readonly TradeOffer[];
}

export interface UserProfile {
  readonly username: string;
  readonly tag: string;
  readonly initials: string;
  readonly memberSince: string;
  readonly plan: string;
}

export interface UserPreferences {
  readonly tradeAlerts: boolean;
  readonly injuryAlerts: boolean;
  readonly lineupReminder: boolean;
  readonly compactTables: boolean;
  readonly themeMode: 'dark' | 'light';
  readonly accentColor: 'orange' | 'blue' | 'green' | 'red' | 'pink' | 'purple';
  readonly language: 'en' | 'es';
}
