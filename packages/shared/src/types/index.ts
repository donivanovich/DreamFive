import type { z } from 'zod';

import type {
  AvailabilityStatus,
  InvitationStatus,
  LeagueMailCategory,
  LeagueRole,
  LeagueStatus,
  MarketMode,
  MatchStatus,
  PlayerRole,
  Position,
  SeasonStatus,
  TransferStatus,
  UserAccountRole,
} from '../enums/index.js';
import type { ScoringWeightsConfig } from '../constants/index.js';
import type {
  advanceGameClockSchema,
  confirmEmailChangeSchema,
  confirmPasswordResetSchema,
  createLeagueSchema,
  createTransferOfferSchema,
  deleteAccountSchema,
  inviteByTagSchema,
  loginSchema,
  registerSchema,
  requestEmailChangeSchema,
  resendVerificationSchema,
  respondInvitationSchema,
  respondTransferOfferSchema,
  updateLineupSchema,
  updatePreferencesSchema,
  updateProfileSchema,
  verifyEmailSchema,
} from '../schemas/index.js';

export type RegisterInput = z.infer<typeof registerSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;
export type RequestEmailChangeInput = z.infer<typeof requestEmailChangeSchema>;
export type ConfirmEmailChangeInput = z.infer<typeof confirmEmailChangeSchema>;
export type ConfirmPasswordResetInput = z.infer<typeof confirmPasswordResetSchema>;
export type CreateLeagueInput = z.infer<typeof createLeagueSchema>;
export type InviteByTagInput = z.infer<typeof inviteByTagSchema>;
export type RespondInvitationInput = z.infer<typeof respondInvitationSchema>;
export type UpdateLineupInput = z.infer<typeof updateLineupSchema>;
export type CreateTransferOfferInput = z.infer<typeof createTransferOfferSchema>;
export type RespondTransferOfferInput = z.infer<typeof respondTransferOfferSchema>;
export type AdvanceGameClockInput = z.infer<typeof advanceGameClockSchema>;

export type ThemeMode = 'dark' | 'light';

export type AccentColor = 'orange' | 'blue' | 'green' | 'red' | 'pink' | 'purple';

export type AppLanguage = 'en' | 'es';

export interface UserPreferencesDto {
  readonly tradeAlerts: boolean;
  readonly injuryAlerts: boolean;
  readonly lineupReminder: boolean;
  readonly compactTables: boolean;
  readonly themeMode: ThemeMode;
  readonly accentColor: AccentColor;
  readonly language: AppLanguage;
}

export interface AuthUserDto {
  readonly id: string;
  readonly email: string;
  readonly role: UserAccountRole;
  readonly username: string;
  readonly tag: string;
  readonly initials: string;
  readonly avatarUrl: string | null;
  readonly emailVerified: boolean;
  readonly pendingEmail: string | null;
  readonly createdAt: string;
  readonly preferences: UserPreferencesDto;
}

export interface RegisterPendingResponseDto {
  readonly requiresEmailVerification: true;
  readonly email: string;
  readonly expiresAt: string;
}

export interface EmailChangeRequestResponseDto {
  readonly pendingEmail: string;
  readonly expiresAt: string;
}

export interface PasswordResetRequestResponseDto {
  readonly sent: true;
  readonly email: string;
  readonly expiresAt: string;
}

export interface PasswordResetValidationDto {
  readonly valid: boolean;
  readonly email?: string;
  readonly reason?: 'MISSING' | 'INVALID' | 'EXPIRED' | 'USED';
}

export interface AuthResponseDto {
  readonly user: AuthUserDto;
  readonly accessToken: string;
}

export interface LeagueSummaryDto {
  readonly id: string;
  readonly name: string;
  readonly status: LeagueStatus;
  readonly marketMode: MarketMode;
  readonly userRole: LeagueRole;
  readonly participantsCount: number;
  readonly maxParticipants: number;
  readonly seasonNumber: number;
  readonly seasonName: string;
  readonly currentRoundNumber: number;
  readonly totalRounds: number;
  readonly gameClockAt: string;
  readonly userTeamId: string;
  readonly userTeamName: string;
  readonly userTeamCode: string;
  readonly userRank: number;
  readonly userTotalFp: number;
  readonly userLastRoundFp: number;
  readonly userAvgFp: number;
  readonly userBudgetMillions: number;
}

export interface PlayerInstanceDto {
  readonly id: string;
  readonly templatePlayerId: string | null;
  readonly name: string;
  readonly initials: string;
  readonly position: Position;
  readonly role: PlayerRole;
  readonly age: number;
  readonly currentTeamId: string;
  readonly teamName: string;
  readonly teamCode: string;
  readonly priceMillions: number;
  readonly priceDeltaMillions: number;
  readonly status: AvailabilityStatus;
  readonly statusNote: string | null;
  readonly gamesOutRemaining: number;
  readonly overallRating: number;
  readonly offense: number;
  readonly defense: number;
  readonly playmaking: number;
  readonly rebounding: number;
  readonly athleticism: number;
  readonly iq: number;
  readonly seasonGamesPlayed: number;
  readonly seasonFantasyPoints: number;
  readonly seasonPtsAvg: number;
  readonly seasonRebAvg: number;
  readonly seasonAstAvg: number;
  readonly isRetired?: boolean;
}

export interface PlayerMatchStatDpBreakdownDto {
  readonly pts: number;
  readonly reb: number;
  readonly ast: number;
  readonly stl: number;
  readonly blk: number;
  readonly tov: number;
  readonly pf: number;
  readonly minutes: number;
}

export interface PlayerDetailMatchStatDto {
  readonly matchId: string;
  readonly roundNumber: number;
  readonly scheduledAt: string;
  readonly teamCode: string;
  readonly opponentTeamId: string;
  readonly opponentTeamCode: string;
  readonly opponentTeamName: string;
  readonly isHome: boolean;
  readonly teamScore: number | null;
  readonly opponentScore: number | null;
  readonly minutes: number;
  readonly pts: number;
  readonly reb: number;
  readonly ast: number;
  readonly stl: number;
  readonly blk: number;
  readonly tov: number;
  readonly pf: number;
  readonly fantasyPoints: number;
  readonly wasStarter: boolean;
  readonly ejected: boolean;
  readonly injured: boolean;
  readonly dpBreakdown: PlayerMatchStatDpBreakdownDto;
}

export interface PlayerDetailResponseDto {
  readonly player: PlayerInstanceDto;
  readonly scoringWeights: ScoringWeightsConfig;
  readonly recentStats: readonly PlayerDetailMatchStatDto[];
  readonly marketHistory: readonly {
    readonly priceMillions: number;
    readonly deltaMillions: number;
    readonly reason: string;
    readonly recordedAt: string;
  }[];
}

export interface LeagueMailDto {
  readonly id: string;
  readonly leagueId: string;
  readonly seasonId: string;
  readonly leagueTeamId: string;
  readonly roundNumber: number | null;
  readonly category: LeagueMailCategory;
  readonly subject: string;
  readonly body: string;
  readonly metadata: Record<string, unknown> | null;
  readonly isRead: boolean;
  readonly createdAt: string;
}

export interface LeagueMailListResponseDto {
  readonly unreadCount: number;
  readonly items: readonly LeagueMailDto[];
}

export interface LineupDto {
  readonly roundNumber: number;
  readonly isLocked: boolean;
  readonly lockMinutesBeforeTipoff: number;
  readonly pgPlayerId: string | null;
  readonly sgPlayerId: string | null;
  readonly sfPlayerId: string | null;
  readonly pfPlayerId: string | null;
  readonly cPlayerId: string | null;
  readonly updatedAt: string;
}

export interface StandingEntryDto {
  readonly rank: number;
  readonly leagueTeamId: string;
  readonly teamName: string;
  readonly teamCode: string;
  readonly isCpuControlled: boolean;
  readonly managerUsername: string | null;
  readonly managerTag: string | null;
  readonly managerAvatarUrl: string | null;
  readonly isUserTeam: boolean;
  readonly fantasyPoints: number;
  readonly lastRoundFp: number;
  readonly avgFp: number;
  readonly wins: number;
  readonly losses: number;
  readonly lastFive: readonly ('W' | 'L')[];
}

export type PlayerSortField =
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

export interface MatchFixtureDto {
  readonly id: string;
  readonly roundNumber: number;
  readonly scheduledAt: string;
  readonly simulatedAt: string | null;
  readonly status: MatchStatus;
  readonly homeTeamId: string;
  readonly homeTeamName: string;
  readonly homeTeamCode: string;
  readonly homeScore: number | null;
  readonly awayTeamId: string;
  readonly awayTeamName: string;
  readonly awayTeamCode: string;
  readonly awayScore: number | null;
  readonly overtimeCount: number;
  readonly winRewardMillions?: number | null;
}

export interface PlayerMatchStatDto {
  readonly playerInstanceId: string;
  readonly playerName: string;
  readonly position: Position;
  readonly leagueTeamId: string;
  readonly teamCode: string;
  readonly minutes: number;
  readonly pts: number;
  readonly reb: number;
  readonly ast: number;
  readonly stl: number;
  readonly blk: number;
  readonly tov: number;
  readonly pf: number;
  readonly fantasyPoints: number;
  readonly wasStarter: boolean;
  readonly ejected: boolean;
  readonly injured: boolean;
}

export interface TeamMatchStatDto {
  readonly leagueTeamId: string;
  readonly teamName: string;
  readonly teamCode: string;
  readonly pts: number;
  readonly reb: number;
  readonly ast: number;
  readonly stl: number;
  readonly blk: number;
  readonly tov: number;
  readonly pf: number;
}

export interface MatchEventDto {
  readonly id: string;
  readonly quarter: number;
  readonly clockLabel: string;
  readonly eventType: string;
  readonly description: string;
}

export interface MatchDetailDto {
  readonly match: MatchFixtureDto;
  readonly teamStats: readonly TeamMatchStatDto[];
  readonly playerStats: readonly PlayerMatchStatDto[];
  readonly events: readonly MatchEventDto[];
}

export interface TransferPlayerSummaryDto {
  readonly id: string;
  readonly name: string;
  readonly position: Position;
  readonly role: PlayerRole;
  readonly priceMillions: number;
}

export type TransferBlockReason = 'REJECTED_OFFER' | 'RECENT_TRADE_ACQUISITION';

export interface TransferBlockedPlayerDto {
  readonly playerId: string;
  readonly playerName: string;
  readonly reason: TransferBlockReason;
  readonly remainingMatches: number;
  readonly unlocksAtTeamMatches: number;
}

export interface TransferOfferDto {
  readonly id: string;
  readonly leagueId: string;
  readonly proposingTeamId: string;
  readonly proposingTeamName: string;
  readonly proposingTeamCode: string;
  readonly receivingTeamId: string;
  readonly receivingTeamName: string;
  readonly receivingTeamCode: string;
  readonly isProposingCpu: boolean;
  readonly isReceivingCpu: boolean;
  readonly offeredPlayers: readonly TransferPlayerSummaryDto[];
  readonly requestedPlayers: readonly TransferPlayerSummaryDto[];
  readonly cashOfferedMillions: number;
  readonly cashRequestedMillions: number;
  readonly status: TransferStatus;
  readonly responseNote: string | null;
  readonly createdAt: string;
  readonly respondedAt: string | null;
}

export interface LeagueInvitationDto {
  readonly id: string;
  readonly leagueId: string;
  readonly leagueName: string;
  readonly invitedByUsername: string;
  readonly invitedTag: string;
  readonly status: InvitationStatus;
  readonly createdAt: string;
}

export interface SeasonSummaryDto {
  readonly id: string;
  readonly seasonNumber: number;
  readonly name: string;
  readonly calendarYear: number;
  readonly calendarMonth: number;
  readonly daysInMonth: number;
  readonly totalRounds: number;
  readonly currentRoundNumber: number;
  readonly status: SeasonStatus;
  readonly startedAt: string;
  readonly endedAt: string | null;
}

export interface SimulationJobDto {
  readonly id: string;
  readonly jobType: string;
  readonly targetRound: number | null;
  readonly targetMatchId: string | null;
  readonly status: string;
  readonly seed: string;
  readonly startedAt: string;
  readonly finishedAt: string | null;
  readonly errorMessage: string | null;
}

export interface DevLeagueStatusDto {
  readonly leagueId: string;
  readonly leagueName: string;
  readonly gameClockAt: string;
  readonly season: SeasonSummaryDto;
  readonly scheduledMatchesRemaining: number;
  readonly completedMatchesCount: number;
  readonly nextScheduledRound: number | null;
  readonly pendingJobsCount: number;
  readonly recentJobs: readonly SimulationJobDto[];
}

export interface RealtimeLeagueEventPayload {
  readonly leagueId: string;
  readonly eventType: string;
  readonly roundNumber?: number;
  readonly matchId?: string;
  readonly timestamp: string;
}

export interface AccountDeletionCandidateDto {
  readonly userId: string;
  readonly username: string;
  readonly tag: string;
  readonly teamName: string;
  readonly teamCode: string;
}

export interface AccountDeletionPresidedLeagueDto {
  readonly leagueId: string;
  readonly leagueName: string;
  readonly candidates: readonly AccountDeletionCandidateDto[];
}

export interface AccountDeletionContextDto {
  readonly presidedLeagues: readonly AccountDeletionPresidedLeagueDto[];
}

export interface SyncClockResponseDto {
  readonly previousGameClockAt: string;
  readonly newGameClockAt: string;
  readonly activeSeasonNumber: number;
  readonly activeSeasonName: string;
  readonly currentRoundNumber: number;
  readonly deletedFutureSeasonsCount: number;
  readonly revertedMatchesCount: number;
}
