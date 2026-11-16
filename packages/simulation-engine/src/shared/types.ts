export type EnginePosition = 'PG' | 'SG' | 'SF' | 'PF' | 'C';

export type EnginePlayerRole = 'SUPERSTAR' | 'STAR' | 'STARTER' | 'ROTATION' | 'ROOKIE' | 'BENCH';

export type EngineAvailability = 'HEALTHY' | 'QUESTIONABLE' | 'INJURED' | 'SUSPENDED';

export interface EngineScoringWeights {
  readonly pts: number;
  readonly reb: number;
  readonly ast: number;
  readonly stl: number;
  readonly blk: number;
  readonly tov: number;
  readonly pf: number;
  readonly min: number;
}

export interface EngineInjuryConfig {
  readonly baseInjuryChancePerGame: number;
  readonly questionableChancePerGame: number;
  readonly injuryDurationGamesMin: number;
  readonly injuryDurationGamesMax: number;
  readonly ejectionChanceByRole: Record<EnginePlayerRole, number>;
}

export interface EnginePlayerInput {
  readonly id: string;
  readonly name: string;
  readonly position: EnginePosition;
  readonly role: EnginePlayerRole;
  readonly age: number;
  readonly status: EngineAvailability;
  readonly overallRating: number;
  readonly offense: number;
  readonly defense: number;
  readonly playmaking: number;
  readonly rebounding: number;
  readonly athleticism: number;
  readonly iq: number;
  readonly priceMillions: number;
}

export interface EngineTeamInput {
  readonly id: string;
  readonly name: string;
  readonly code: string;
  readonly roster: readonly EnginePlayerInput[];
}

export interface SimulatedPlayerBox {
  readonly playerId: string;
  readonly playerName: string;
  readonly position: EnginePosition;
  readonly role: EnginePlayerRole;
  readonly teamId: string;
  readonly wasStarter: boolean;
  readonly minutes: number;
  readonly pts: number;
  readonly reb: number;
  readonly ast: number;
  readonly stl: number;
  readonly blk: number;
  readonly tov: number;
  readonly pf: number;
  readonly fantasyPoints: number;
  readonly ejected: boolean;
  readonly injured: boolean;
  readonly nextStatus: EngineAvailability;
  readonly nextGamesOut: number;
  readonly statusReason: string | null;
}

export interface SimulatedTeamTotals {
  readonly teamId: string;
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

export interface SimulatedMatchEvent {
  readonly quarter: number;
  readonly clockLabel: string;
  readonly eventType: 'TIPOFF' | 'RUN' | 'CLUTCH' | 'INJURY' | 'EJECTION' | 'OVERTIME' | 'FINAL';
  readonly playerId: string | null;
  readonly teamId: string | null;
  readonly description: string;
}

export interface SimulateMatchOutput {
  readonly seed: string;
  readonly homeScore: number;
  readonly awayScore: number;
  readonly overtimeCount: number;
  readonly homeTotals: SimulatedTeamTotals;
  readonly awayTotals: SimulatedTeamTotals;
  readonly playerBoxes: readonly SimulatedPlayerBox[];
  readonly events: readonly SimulatedMatchEvent[];
}
