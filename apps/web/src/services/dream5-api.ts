import type {
  AccountDeletionContextDto,
  AuthResponseDto,
  AuthUserDto,
  AvailabilityStatus,
  ConfirmEmailChangeInput,
  ConfirmPasswordResetInput,
  CreateLeagueInput,
  CreateTransferOfferInput,
  DeleteAccountInput,
  DevLeagueStatusDto,
  EmailChangeRequestResponseDto,
  LeagueInvitationDto,
  LeagueMailCategory,
  LeagueMailListResponseDto,
  LeagueRole,
  LeagueSummaryDto,
  LineupDto,
  LoginInput,
  MarketMode,
  MatchDetailDto,
  MatchFixtureDto,
  MatchStatus,
  PasswordResetRequestResponseDto,
  PasswordResetValidationDto,
  PlayerDetailResponseDto,
  PlayerInstanceDto,
  PlayerRole,
  PlayerSortField,
  Position,
  RegisterInput,
  RegisterPendingResponseDto,
  RequestEmailChangeInput,
  ResendVerificationInput,
  SeasonSummaryDto,
  StandingEntryDto,
  SyncClockResponseDto,
  TransferBlockedPlayerDto,
  TransferOfferDto,
  UpdateLineupInput,
  UpdatePreferencesInput,
  UpdateProfileInput,
  VerifyEmailInput,
} from '@dream5/shared';

import { apiFetch, setStoredAccessToken } from './api-client';

export interface LeagueParticipantResponse {
  readonly userId: string;
  readonly username: string;
  readonly tag: string;
  readonly initials: string;
  readonly avatarUrl?: string | null;
  readonly role: LeagueRole;
  readonly leagueTeamId: string;
  readonly teamName: string;
  readonly teamCode: string;
  readonly rank: number;
  readonly fantasyPoints: number;
  readonly wins: number;
  readonly losses: number;
}

export interface LeagueDetailResponse {
  readonly league: LeagueSummaryDto;
  readonly season: SeasonSummaryDto;
  readonly members: readonly LeagueParticipantResponse[];
}

export interface LeagueTeamSummaryResponse {
  readonly id: string;
  readonly name: string;
  readonly shortName: string;
  readonly code: string;
  readonly budgetMillions: number;
  readonly isCpuControlled: boolean;
  readonly managerUsername: string | null;
  readonly managerTag: string | null;
  readonly managerAvatarUrl?: string | null;
  readonly isUserTeam: boolean;
  readonly rank: number;
  readonly totalFantasyPoints: number;
  readonly wins: number;
  readonly losses: number;
  readonly rosterCount: number;
}

export interface LeagueTeamDetailResponse {
  readonly team: LeagueTeamSummaryResponse;
  readonly roster: readonly PlayerInstanceDto[];
}

export interface PlayersListResponse {
  readonly total: number;
  readonly items: readonly PlayerInstanceDto[];
}

export type PlayerDetailResponse = PlayerDetailResponseDto;

export interface MatchesListResponse {
  readonly seasonNumber: number;
  readonly currentRoundNumber: number;
  readonly totalRounds: number;
  readonly items: readonly MatchFixtureDto[];
}

export interface RankingsResponse {
  readonly seasonNumber: number;
  readonly seasonName: string;
  readonly currentRoundNumber: number;
  readonly standings: readonly StandingEntryDto[];
  readonly recentUserScores: readonly {
    readonly roundNumber: number;
    readonly totalFp: number;
    readonly breakdownJson: Record<
      string,
      { readonly playerId: string | null; readonly playerName: string | null; readonly fp: number }
    >;
  }[];
}

export interface MarketOverviewResponse {
  readonly marketMode: MarketMode;
  readonly gainers: readonly PlayerInstanceDto[];
  readonly fallers: readonly PlayerInstanceDto[];
  readonly mostValuable: readonly PlayerInstanceDto[];
  readonly recentMovements: readonly {
    readonly id: string;
    readonly playerId: string;
    readonly playerName: string;
    readonly position: Position;
    readonly teamCode: string;
    readonly priceMillions: number;
    readonly deltaMillions: number;
    readonly reason: string;
    readonly recordedAt: string;
  }[];
}

export interface TransfersListResponse {
  readonly userTeamId: string;
  readonly userBudgetMillions: number;
  readonly blockedPlayers: readonly TransferBlockedPlayerDto[];
  readonly offers: readonly TransferOfferDto[];
  readonly history: readonly {
    readonly id: string;
    readonly offerId: string;
    readonly fromTeamName: string;
    readonly fromTeamCode: string;
    readonly toTeamName: string;
    readonly toTeamCode: string;
    readonly movedPlayers: readonly {
      readonly id: string;
      readonly name: string;
      readonly position: Position;
      readonly role: PlayerRole;
      readonly priceMillions: number;
    }[];
    readonly cashTransferredNet: number;
    readonly summary: string;
    readonly executedAt: string;
  }[];
}

export const authApi = {
  async login(input: LoginInput): Promise<AuthResponseDto> {
    const res = await apiFetch<AuthResponseDto>('/auth/login', { method: 'POST', body: input });
    setStoredAccessToken(res.accessToken);
    return res;
  },
  register(input: RegisterInput): Promise<RegisterPendingResponseDto> {
    return apiFetch<RegisterPendingResponseDto>('/auth/register', { method: 'POST', body: input });
  },
  async verifyEmail(input: VerifyEmailInput): Promise<AuthResponseDto> {
    const res = await apiFetch<AuthResponseDto>('/auth/verify-email', {
      method: 'POST',
      body: input,
    });
    setStoredAccessToken(res.accessToken);
    return res;
  },
  resendVerification(
    input: ResendVerificationInput,
  ): Promise<{ readonly sent: true; readonly email: string; readonly expiresAt: string }> {
    return apiFetch('/auth/resend-verification', { method: 'POST', body: input });
  },
  validatePasswordReset(token: string): Promise<PasswordResetValidationDto> {
    return apiFetch<PasswordResetValidationDto>(
      `/auth/password-reset/validate?token=${encodeURIComponent(token)}`,
    );
  },
  confirmPasswordReset(input: ConfirmPasswordResetInput): Promise<{ readonly message: string }> {
    return apiFetch<{ readonly message: string }>('/auth/password-reset/confirm', {
      method: 'POST',
      body: input,
    });
  },
  async logout(): Promise<void> {
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } finally {
      setStoredAccessToken(null);
    }
  },
  async me(): Promise<AuthUserDto | null> {
    try {
      const res = await apiFetch<{ readonly user: AuthUserDto | null }>('/auth/session');
      return res.user;
    } catch {
      return null;
    }
  },
};

export const usersApi = {
  updatePreferences(input: UpdatePreferencesInput): Promise<AuthUserDto> {
    return apiFetch<AuthUserDto>('/users/me/preferences', { method: 'PATCH', body: input });
  },
  updateProfile(input: UpdateProfileInput): Promise<AuthUserDto> {
    return apiFetch<AuthUserDto>('/users/me/profile', { method: 'PATCH', body: input });
  },
  requestEmailChange(input: RequestEmailChangeInput): Promise<EmailChangeRequestResponseDto> {
    return apiFetch<EmailChangeRequestResponseDto>('/users/me/email-change/request', {
      method: 'POST',
      body: input,
    });
  },
  confirmEmailChange(input: ConfirmEmailChangeInput): Promise<AuthUserDto> {
    return apiFetch<AuthUserDto>('/users/me/email-change/confirm', {
      method: 'POST',
      body: input,
    });
  },
  requestPasswordReset(): Promise<PasswordResetRequestResponseDto> {
    return apiFetch<PasswordResetRequestResponseDto>('/users/me/password-reset/request', {
      method: 'POST',
    });
  },
  uploadAvatar(file: File): Promise<AuthUserDto> {
    const form = new FormData();
    form.append('file', file);
    return apiFetch<AuthUserDto>('/users/me/avatar', { method: 'POST', body: form });
  },
  removeAvatar(): Promise<AuthUserDto> {
    return apiFetch<AuthUserDto>('/users/me/avatar', { method: 'DELETE' });
  },
  search(query: string) {
    return apiFetch<
      readonly {
        readonly id: string;
        readonly username: string;
        readonly tag: string;
        readonly initials: string;
        readonly avatarUrl: string | null;
      }[]
    >(`/users/search?q=${encodeURIComponent(query)}`);
  },
  deletionContext(): Promise<AccountDeletionContextDto> {
    return apiFetch<AccountDeletionContextDto>('/users/me/deletion-context');
  },
  async deleteAccount(input: DeleteAccountInput) {
    const res = await apiFetch<{
      readonly deleted: true;
      readonly deletedLeagueIds: readonly string[];
      readonly promotedLeagues: readonly {
        readonly leagueId: string;
        readonly leagueName: string;
        readonly successorUserId: string;
      }[];
    }>('/users/me/delete', { method: 'POST', body: input });
    setStoredAccessToken(null);
    return res;
  },
};

export const leaguesApi = {
  list(): Promise<readonly LeagueSummaryDto[]> {
    return apiFetch<readonly LeagueSummaryDto[]>('/leagues');
  },
  create(input: CreateLeagueInput): Promise<{
    readonly leagueId: string;
    readonly assignedTeamId: string;
    readonly assignedTeamCode: string;
    readonly summary: LeagueSummaryDto;
  }> {
    return apiFetch('/leagues', { method: 'POST', body: input });
  },
  detail(leagueId: string): Promise<LeagueDetailResponse> {
    return apiFetch<LeagueDetailResponse>(`/leagues/${leagueId}`);
  },
};

export const invitationsApi = {
  listPending(): Promise<readonly LeagueInvitationDto[]> {
    return apiFetch<readonly LeagueInvitationDto[]>('/invitations/pending');
  },
  listByLeague(leagueId: string): Promise<readonly LeagueInvitationDto[]> {
    return apiFetch<readonly LeagueInvitationDto[]>(`/leagues/${leagueId}/invitations`);
  },
  inviteByTag(leagueId: string, tag: string): Promise<LeagueInvitationDto> {
    return apiFetch<LeagueInvitationDto>(`/leagues/${leagueId}/invitations`, {
      method: 'POST',
      body: { tag },
    });
  },
  accept(invitationId: string) {
    return apiFetch<{
      readonly status: string;
      readonly leagueId: string;
      readonly assignedTeamName?: string;
      readonly inheritedPoints?: number;
    }>(`/invitations/${invitationId}/accept`, { method: 'POST' });
  },
  reject(invitationId: string) {
    return apiFetch(`/invitations/${invitationId}/reject`, { method: 'POST' });
  },
};

export const teamsApi = {
  list(leagueId: string): Promise<readonly LeagueTeamSummaryResponse[]> {
    return apiFetch<readonly LeagueTeamSummaryResponse[]>(`/leagues/${leagueId}/teams`);
  },
  detail(leagueId: string, teamId: string): Promise<LeagueTeamDetailResponse> {
    return apiFetch<LeagueTeamDetailResponse>(`/leagues/${leagueId}/teams/${teamId}`);
  },
};

export const playersApi = {
  list(
    leagueId: string,
    params: {
      readonly search?: string;
      readonly position?: Position;
      readonly role?: PlayerRole;
      readonly status?: AvailabilityStatus;
      readonly teamId?: string;
      readonly sortBy?: PlayerSortField;
      readonly sortDir?: 'asc' | 'desc';
      readonly limit?: number;
      readonly offset?: number;
    } = {},
  ): Promise<PlayersListResponse> {
    const qs = new URLSearchParams();
    if (params.search) qs.set('search', params.search);
    if (params.position) qs.set('position', params.position);
    if (params.role) qs.set('role', params.role);
    if (params.status) qs.set('status', params.status);
    if (params.teamId) qs.set('teamId', params.teamId);
    if (params.sortBy) qs.set('sortBy', params.sortBy);
    if (params.sortDir) qs.set('sortDir', params.sortDir);
    if (params.limit !== undefined) qs.set('limit', String(params.limit));
    if (params.offset !== undefined) qs.set('offset', String(params.offset));
    const query = qs.toString();
    return apiFetch<PlayersListResponse>(`/leagues/${leagueId}/players${query ? `?${query}` : ''}`);
  },
  detail(leagueId: string, playerId: string): Promise<PlayerDetailResponse> {
    return apiFetch<PlayerDetailResponse>(`/leagues/${leagueId}/players/${playerId}`);
  },
};

export const lineupApi = {
  get(leagueId: string, roundNumber?: number): Promise<LineupDto> {
    const q = roundNumber !== undefined ? `?roundNumber=${String(roundNumber)}` : '';
    return apiFetch<LineupDto>(`/leagues/${leagueId}/lineup${q}`);
  },
  save(leagueId: string, input: UpdateLineupInput, roundNumber?: number): Promise<LineupDto> {
    const q = roundNumber !== undefined ? `?roundNumber=${String(roundNumber)}` : '';
    return apiFetch<LineupDto>(`/leagues/${leagueId}/lineup${q}`, {
      method: 'PUT',
      body: input,
    });
  },
};

export const matchesApi = {
  list(
    leagueId: string,
    params: {
      readonly roundNumber?: number;
      readonly teamId?: string;
      readonly status?: MatchStatus;
    } = {},
  ): Promise<MatchesListResponse> {
    const qs = new URLSearchParams();
    if (params.roundNumber !== undefined) qs.set('roundNumber', String(params.roundNumber));
    if (params.teamId) qs.set('teamId', params.teamId);
    if (params.status) qs.set('status', params.status);
    const query = qs.toString();
    return apiFetch<MatchesListResponse>(`/leagues/${leagueId}/matches${query ? `?${query}` : ''}`);
  },
  detail(leagueId: string, matchId: string): Promise<MatchDetailDto> {
    return apiFetch<MatchDetailDto>(`/leagues/${leagueId}/matches/${matchId}`);
  },
};

export const rankingsApi = {
  get(leagueId: string): Promise<RankingsResponse> {
    return apiFetch<RankingsResponse>(`/leagues/${leagueId}/rankings`);
  },
};

export const marketApi = {
  get(leagueId: string): Promise<MarketOverviewResponse> {
    return apiFetch<MarketOverviewResponse>(`/leagues/${leagueId}/market`);
  },
};

export const transfersApi = {
  list(leagueId: string): Promise<TransfersListResponse> {
    return apiFetch<TransfersListResponse>(`/leagues/${leagueId}/transfers`);
  },
  create(leagueId: string, input: CreateTransferOfferInput) {
    return apiFetch<{
      readonly offerId: string;
      readonly status: string;
      readonly responseNote: string | null;
    }>(`/leagues/${leagueId}/transfers`, { method: 'POST', body: input });
  },
  accept(leagueId: string, offerId: string, note?: string) {
    return apiFetch(`/leagues/${leagueId}/transfers/${offerId}/accept`, {
      method: 'POST',
      body: note ? { note } : {},
    });
  },
  reject(leagueId: string, offerId: string, note?: string) {
    return apiFetch(`/leagues/${leagueId}/transfers/${offerId}/reject`, {
      method: 'POST',
      body: note ? { note } : {},
    });
  },
  cancel(leagueId: string, offerId: string) {
    return apiFetch(`/leagues/${leagueId}/transfers/${offerId}/cancel`, {
      method: 'POST',
      body: {},
    });
  },
};

export const seasonsApi = {
  list(leagueId: string): Promise<readonly SeasonSummaryDto[]> {
    return apiFetch<readonly SeasonSummaryDto[]>(`/leagues/${leagueId}/seasons`);
  },
  advance(leagueId: string) {
    return apiFetch(`/leagues/${leagueId}/seasons/advance`, { method: 'POST' });
  },
};

export const mailApi = {
  list(
    leagueId: string,
    params: { readonly category?: LeagueMailCategory; readonly unreadOnly?: boolean } = {},
  ): Promise<LeagueMailListResponseDto> {
    const qs = new URLSearchParams();
    if (params.category) qs.set('category', params.category);
    if (params.unreadOnly) qs.set('unreadOnly', 'true');
    const query = qs.toString();
    return apiFetch<LeagueMailListResponseDto>(
      `/leagues/${leagueId}/mail${query ? `?${query}` : ''}`,
    );
  },
  markRead(leagueId: string, mailId: string) {
    return apiFetch<{ readonly id: string; readonly isRead: true }>(
      `/leagues/${leagueId}/mail/${mailId}/read`,
      { method: 'POST' },
    );
  },
  markAllRead(leagueId: string) {
    return apiFetch<{ readonly updatedCount: number }>(`/leagues/${leagueId}/mail/read-all`, {
      method: 'POST',
    });
  },
  remove(leagueId: string, mailId: string) {
    return apiFetch<{ readonly deleted: true }>(`/leagues/${leagueId}/mail/${mailId}`, {
      method: 'DELETE',
    });
  },
};

export const devApi = {
  status(leagueId: string): Promise<DevLeagueStatusDto> {
    return apiFetch<DevLeagueStatusDto>(`/dev/leagues/${leagueId}/status`);
  },
  simulateRound(leagueId: string, roundNumber?: number) {
    return apiFetch<{ readonly roundNumber: number; readonly executedVia: string }>(
      `/dev/leagues/${leagueId}/simulate-round`,
      { method: 'POST', body: roundNumber ? { roundNumber } : {} },
    );
  },
  simulateMatch(leagueId: string, matchId?: string) {
    return apiFetch(`/dev/leagues/${leagueId}/simulate-match`, {
      method: 'POST',
      body: matchId ? { matchId } : {},
    });
  },
  advanceClock(leagueId: string, hours: number) {
    return apiFetch<{
      readonly newGameClockAt: string;
      readonly simulatedRounds: readonly number[];
    }>(`/dev/leagues/${leagueId}/advance-clock`, {
      method: 'POST',
      body: { hours, simulateDueRounds: true },
    });
  },
  repriceMarket(leagueId: string) {
    return apiFetch(`/dev/leagues/${leagueId}/reprice-market`, { method: 'POST' });
  },
  finishSeason(leagueId: string, simulateRemainingRounds = false) {
    return apiFetch(`/dev/leagues/${leagueId}/finish-season`, {
      method: 'POST',
      body: { simulateRemainingRounds },
    });
  },
  syncClock(leagueId: string): Promise<SyncClockResponseDto> {
    return apiFetch<SyncClockResponseDto>(`/dev/leagues/${leagueId}/sync-clock`, {
      method: 'POST',
      body: {},
    });
  },
};
