import type { PlayerInstanceDto } from '@dreamfive/shared';

export interface PlayerInstanceWithTeamRow {
  readonly id: string;
  readonly templatePlayerId: string | null;
  readonly isRetired?: boolean;
  readonly name: string;
  readonly initials: string;
  readonly position: PlayerInstanceDto['position'];
  readonly role: PlayerInstanceDto['role'];
  readonly age: number;
  readonly currentTeamId: string;
  readonly priceMillions: number;
  readonly priceDeltaMillions: number;
  readonly status: PlayerInstanceDto['status'];
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
  readonly currentTeam: {
    readonly name: string;
    readonly code: string;
  };
}

export function toPlayerInstanceDto(row: PlayerInstanceWithTeamRow): PlayerInstanceDto {
  return {
    id: row.id,
    templatePlayerId: row.templatePlayerId,
    name: row.name,
    initials: row.initials,
    position: row.position,
    role: row.role,
    age: row.age,
    currentTeamId: row.currentTeamId,
    teamName: row.currentTeam.name,
    teamCode: row.currentTeam.code,
    priceMillions: row.priceMillions,
    priceDeltaMillions: row.priceDeltaMillions,
    status: row.status,
    statusNote: row.statusNote,
    gamesOutRemaining: row.gamesOutRemaining,
    overallRating: row.overallRating,
    offense: row.offense,
    defense: row.defense,
    playmaking: row.playmaking,
    rebounding: row.rebounding,
    athleticism: row.athleticism,
    iq: row.iq,
    seasonGamesPlayed: row.seasonGamesPlayed,
    seasonFantasyPoints: row.seasonFantasyPoints,
    seasonPtsAvg: row.seasonPtsAvg,
    seasonRebAvg: row.seasonRebAvg,
    seasonAstAvg: row.seasonAstAvg,
    ...(row.isRetired !== undefined ? { isRetired: row.isRetired } : {}),
  };
}
