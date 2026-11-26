import type { SeasonResetConfig } from '@dream5/shared';

export interface SimulateRoundJobData {
  readonly leagueId: string;
  readonly roundNumber: number;
  readonly simJobId?: string;
}

export interface SimulateMatchJobData {
  readonly leagueId: string;
  readonly matchId: string;
  readonly simJobId?: string;
}

export interface RepriceMarketJobData {
  readonly leagueId?: string;
  readonly reason: string;
  readonly simJobId?: string;
}

export interface RecalculateRankingsJobData {
  readonly leagueId: string;
  readonly seasonId: string;
  readonly roundNumber: number;
}

export interface SeasonRolloverJobData {
  readonly leagueId: string;
  readonly expectedSeasonId?: string;
  readonly resetConfig?: SeasonResetConfig;
  readonly simJobId?: string;
}

export interface LeagueMaintenanceJobData {
  readonly leagueId: string;
  readonly seasonId?: string;
  readonly roundNumber?: number;
}
