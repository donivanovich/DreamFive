export const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'] as const;
export type Position = (typeof POSITIONS)[number];

export const POSITION_LABELS: Record<Position, string> = {
  PG: 'Base',
  SG: 'Escolta',
  SF: 'Alero',
  PF: 'Ala-pívot',
  C: 'Pívot',
};

export const PLAYER_ROLES = [
  'SUPERSTAR',
  'STAR',
  'STARTER',
  'ROTATION',
  'ROOKIE',
  'BENCH',
] as const;
export type PlayerRole = (typeof PLAYER_ROLES)[number];

export const PLAYER_ROLE_LABELS: Record<PlayerRole, string> = {
  SUPERSTAR: 'Superestrella',
  STAR: 'Estrella',
  STARTER: 'Inicial',
  ROTATION: 'Rotación',
  ROOKIE: 'Rookie',
  BENCH: 'Calientabanquillos',
};

export const AVAILABILITY_STATUSES = ['HEALTHY', 'QUESTIONABLE', 'INJURED', 'SUSPENDED'] as const;
export type AvailabilityStatus = (typeof AVAILABILITY_STATUSES)[number];

export const AVAILABILITY_LABELS: Record<AvailabilityStatus, string> = {
  HEALTHY: 'Disponible',
  QUESTIONABLE: 'Duda',
  INJURED: 'Lesionado',
  SUSPENDED: 'Expulsado',
};

export const USER_ACCOUNT_ROLES = ['USER', 'ADMIN'] as const;
export type UserAccountRole = (typeof USER_ACCOUNT_ROLES)[number];

export const LEAGUE_ROLES = ['PRESIDENT', 'MEMBER'] as const;
export type LeagueRole = (typeof LEAGUE_ROLES)[number];

export const LEAGUE_ROLE_LABELS: Record<LeagueRole, string> = {
  PRESIDENT: 'Presidente',
  MEMBER: 'Miembro',
};

export const LEAGUE_STATUSES = ['ACTIVE', 'COMPLETED'] as const;
export type LeagueStatus = (typeof LEAGUE_STATUSES)[number];

export const SEASON_STATUSES = ['ACTIVE', 'COMPLETED'] as const;
export type SeasonStatus = (typeof SEASON_STATUSES)[number];

export const MARKET_MODES = ['LEAGUE_ISOLATED', 'GLOBAL_HYBRID'] as const;
export type MarketMode = (typeof MARKET_MODES)[number];

export const MATCH_STATUSES = ['SCHEDULED', 'IN_PROGRESS', 'FINAL'] as const;
export type MatchStatus = (typeof MATCH_STATUSES)[number];

export const TRANSFER_STATUSES = [
  'PENDING',
  'ACCEPTED',
  'REJECTED',
  'CANCELLED',
  'EXPIRED',
] as const;
export type TransferStatus = (typeof TRANSFER_STATUSES)[number];

export const INVITATION_STATUSES = ['PENDING', 'ACCEPTED', 'REJECTED'] as const;
export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

export const LEAGUE_MAIL_CATEGORIES = [
  'MATCH_RESULT',
  'TRANSFER_SENT',
  'TRANSFER_RECEIVED',
  'TRANSFER_ACCEPTED',
  'TRANSFER_REJECTED',
  'INJURY',
  'EJECTION',
  'RETIREMENT_REPLACEMENT',
  'SEASON_SUMMARY',
  'PRESIDENT_PROMOTION',
] as const;
export type LeagueMailCategory = (typeof LEAGUE_MAIL_CATEGORIES)[number];
