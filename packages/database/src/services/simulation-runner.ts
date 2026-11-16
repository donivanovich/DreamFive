import { randomUUID } from 'node:crypto';
import {
  LEAGUE_RULES,
  type Position,
  PROVISIONAL_GAME_CONFIG,
  type ScoringWeightsConfig,
  type SeasonResetConfig,
} from '@dream5/shared';
import {
  createSeededRng,
  distributeRoundsAcrossMonth,
  evaluatePlayerProgression,
  generateDoubleRoundRobinFixtures,
  generateReplacementRookieBlueprint,
  getDaysInCalendarMonth,
  recalculateMarketPrices,
  simulateBasketballMatch,
} from '@dream5/simulation-engine';

import { Prisma, type PrismaClient } from '../generated/prisma/client.js';
import { formatSpanishSeasonName, pickDefaultLineupForTeam } from './league-bootstrap.js';
import {
  buildMatchResultMailInput,
  buildRetirementReplacementMailInput,
  type CreateLeagueMailInput,
  recordHumanTeamMailsInTx,
} from './league-mail.js';
import { runAutonomousCpuTransfersInTx } from './transfer-engine.js';

function parseScoringWeights(raw: unknown): ScoringWeightsConfig {
  const defaults = PROVISIONAL_GAME_CONFIG.scoringWeights;
  if (!raw || typeof raw !== 'object') {
    return defaults;
  }
  const obj = raw as Record<string, unknown>;
  const readNum = (key: keyof ScoringWeightsConfig): number => {
    const val = obj[key];
    return typeof val === 'number' && Number.isFinite(val) ? val : defaults[key];
  };

  return {
    pts: readNum('pts'),
    reb: readNum('reb'),
    ast: readNum('ast'),
    stl: readNum('stl'),
    blk: readNum('blk'),
    tov: readNum('tov'),
    pf: readNum('pf'),
    min: readNum('min'),
  };
}

export interface SimulateSingleMatchResult {
  readonly alreadyCompleted: boolean;
  readonly matchId: string;
  readonly seasonId: string;
  readonly roundNumber: number;
  readonly homeScore: number;
  readonly awayScore: number;
}

/**
 * Simula un único partido programado dentro de una transacción aislada por liga,
 * guardando box-scores, eventos, lesiones/expulsiones y progresión cada N partidos.
 */
export async function simulateSingleMatchInTx(
  tx: Prisma.TransactionClient,
  params: {
    readonly leagueId: string;
    readonly matchId: string;
    readonly simulatedAt?: Date;
  },
): Promise<SimulateSingleMatchResult> {
  const match = await tx.match.findFirst({
    where: { id: params.matchId, leagueId: params.leagueId },
    include: {
      league: true,
      homeTeam: true,
      awayTeam: true,
    },
  });

  if (!match) {
    throw new Error(`Partido ${params.matchId} no encontrado en liga ${params.leagueId}`);
  }

  if (match.status === 'FINAL') {
    return {
      alreadyCompleted: true,
      matchId: match.id,
      seasonId: match.seasonId,
      roundNumber: match.roundNumber,
      homeScore: match.homeScore ?? 0,
      awayScore: match.awayScore ?? 0,
    };
  }

  const players = await tx.playerInstance.findMany({
    where: {
      leagueId: params.leagueId,
      isRetired: false,
      currentTeamId: { in: [match.homeTeamId, match.awayTeamId] },
    },
    orderBy: [{ overallRating: 'desc' }, { name: 'asc' }],
  });

  const homeRoster = players.filter((p) => p.currentTeamId === match.homeTeamId);
  const awayRoster = players.filter((p) => p.currentTeamId === match.awayTeamId);

  const mapPlayer = (p: (typeof players)[number]) => ({
    id: p.id,
    name: p.name,
    position: p.position,
    role: p.role,
    age: p.age,
    status: p.status,
    overallRating: p.overallRating,
    offense: p.offense,
    defense: p.defense,
    playmaking: p.playmaking,
    rebounding: p.rebounding,
    athleticism: p.athleticism,
    iq: p.iq,
    priceMillions: p.priceMillions,
  });

  const scoringWeights = parseScoringWeights(match.league.scoringConfigJson);
  const simOutput = simulateBasketballMatch({
    homeTeam: {
      id: match.homeTeam.id,
      name: match.homeTeam.name,
      code: match.homeTeam.code,
      roster: homeRoster.map(mapPlayer),
    },
    awayTeam: {
      id: match.awayTeam.id,
      name: match.awayTeam.name,
      code: match.awayTeam.code,
      roster: awayRoster.map(mapPlayer),
    },
    seed: match.seed,
    scoringWeights,
    injuryConfig: PROVISIONAL_GAME_CONFIG.injuriesAndEjections,
  });

  const simulatedAt = params.simulatedAt ?? new Date();

  await tx.match.update({
    where: { id: match.id },
    data: {
      status: 'FINAL',
      simulatedAt,
      homeScore: simOutput.homeScore,
      awayScore: simOutput.awayScore,
      overtimeCount: simOutput.overtimeCount,
    },
  });

  await tx.teamMatchStat.createMany({
    data: [simOutput.homeTotals, simOutput.awayTotals].map((tot) => ({
      leagueId: params.leagueId,
      matchId: match.id,
      leagueTeamId: tot.teamId,
      pts: tot.pts,
      reb: tot.reb,
      ast: tot.ast,
      stl: tot.stl,
      blk: tot.blk,
      tov: tot.tov,
      pf: tot.pf,
    })),
  });

  await tx.playerMatchStat.createMany({
    data: simOutput.playerBoxes.map((box) => ({
      leagueId: params.leagueId,
      seasonId: match.seasonId,
      matchId: match.id,
      roundNumber: match.roundNumber,
      leagueTeamId: box.teamId,
      playerInstanceId: box.playerId,
      minutes: box.minutes,
      pts: box.pts,
      reb: box.reb,
      ast: box.ast,
      stl: box.stl,
      blk: box.blk,
      tov: box.tov,
      pf: box.pf,
      fantasyPoints: box.fantasyPoints,
      wasStarter: box.wasStarter,
      ejected: box.ejected,
      injured: box.injured,
    })),
  });

  if (simOutput.events.length > 0) {
    await tx.matchEvent.createMany({
      data: simOutput.events.map((ev) => ({
        leagueId: params.leagueId,
        matchId: match.id,
        quarter: ev.quarter,
        clockLabel: ev.clockLabel,
        eventType: ev.eventType,
        playerInstanceId: ev.playerId,
        leagueTeamId: ev.teamId,
        description: ev.description,
      })),
    });
  }

  const playerById = new Map(players.map((p) => [p.id, p]));
  const progressionRng = createSeededRng(`${match.seed}:progression`);
  const teamSuperstarCount = new Map<string, boolean>();
  for (const p of players) {
    if (p.role === 'SUPERSTAR') {
      teamSuperstarCount.set(p.currentTeamId, true);
    }
  }
  const matchMails: CreateLeagueMailInput[] = [];

  for (const box of simOutput.playerBoxes) {
    const existing = playerById.get(box.playerId);
    if (!existing) {
      continue;
    }

    let nextStatus = existing.status;
    let nextGamesOut: number;
    let nextStatusNote = existing.statusNote;

    if (existing.status === 'INJURED' || existing.status === 'SUSPENDED') {
      const decremented = Math.max(0, existing.gamesOutRemaining - 1);
      if (decremented === 0) {
        nextStatus = 'HEALTHY';
        nextGamesOut = 0;
        nextStatusNote = null;
        await tx.injury.updateMany({
          where: {
            leagueId: params.leagueId,
            playerInstanceId: existing.id,
            active: true,
          },
          data: { gamesRemaining: 0, active: false, resolvedAt: simulatedAt },
        });
        await tx.suspension.updateMany({
          where: {
            leagueId: params.leagueId,
            playerInstanceId: existing.id,
            active: true,
          },
          data: { gamesRemaining: 0, active: false, resolvedAt: simulatedAt },
        });
      } else {
        nextGamesOut = decremented;
        if (existing.status === 'INJURED') {
          await tx.injury.updateMany({
            where: {
              leagueId: params.leagueId,
              playerInstanceId: existing.id,
              active: true,
            },
            data: { gamesRemaining: decremented },
          });
        } else {
          await tx.suspension.updateMany({
            where: {
              leagueId: params.leagueId,
              playerInstanceId: existing.id,
              active: true,
            },
            data: { gamesRemaining: decremented },
          });
        }
      }
    } else if (box.injured || box.nextStatus === 'INJURED') {
      nextStatus = 'INJURED';
      nextGamesOut = Math.max(1, box.nextGamesOut);
      nextStatusNote = box.statusReason ?? 'In-game injury';
      await tx.injury.create({
        data: {
          leagueId: params.leagueId,
          playerInstanceId: existing.id,
          matchId: match.id,
          reason: nextStatusNote,
          gamesRemaining: nextGamesOut,
          active: true,
        },
      });
      const opponent =
        existing.currentTeamId === match.homeTeamId ? match.awayTeam : match.homeTeam;
      matchMails.push({
        leagueId: params.leagueId,
        seasonId: match.seasonId,
        leagueTeamId: existing.currentTeamId,
        roundNumber: match.roundNumber,
        category: 'INJURY',
        subject: `Injury Report (R${String(match.roundNumber)}): ${existing.name} (${String(nextGamesOut)}G)`,
        body: `${existing.name} (${existing.position}) suffered an injury against ${opponent.name} and is expected to miss ${String(nextGamesOut)} match(es). Detail: ${nextStatusNote}.`,
        metadata: {
          playerId: existing.id,
          playerName: existing.name,
          playerPosition: existing.position,
          gamesOut: nextGamesOut,
          reason: nextStatusNote,
          opponentTeamName: opponent.name,
        },
      });
    } else if (box.ejected || box.nextStatus === 'SUSPENDED') {
      nextStatus = 'SUSPENDED';
      nextGamesOut = Math.max(1, box.nextGamesOut);
      nextStatusNote = box.statusReason ?? 'Disciplinary ejection';
      await tx.suspension.create({
        data: {
          leagueId: params.leagueId,
          playerInstanceId: existing.id,
          matchId: match.id,
          reason: nextStatusNote,
          gamesRemaining: nextGamesOut,
          active: true,
        },
      });
      const opponent =
        existing.currentTeamId === match.homeTeamId ? match.awayTeam : match.homeTeam;
      matchMails.push({
        leagueId: params.leagueId,
        seasonId: match.seasonId,
        leagueTeamId: existing.currentTeamId,
        roundNumber: match.roundNumber,
        category: 'EJECTION',
        subject: `Suspension Notice (R${String(match.roundNumber)}): ${existing.name} (${String(nextGamesOut)}G)`,
        body: `${existing.name} (${existing.position}) was ejected against ${opponent.name} and suspended for ${String(nextGamesOut)} match(es). Reason: ${nextStatusNote}.`,
        metadata: {
          playerId: existing.id,
          playerName: existing.name,
          playerPosition: existing.position,
          gamesOut: nextGamesOut,
          reason: nextStatusNote,
          opponentTeamName: opponent.name,
        },
      });
    } else if (box.nextStatus === 'QUESTIONABLE') {
      nextStatus = 'QUESTIONABLE';
      nextGamesOut = 0;
      nextStatusNote = box.statusReason ?? 'Minor soreness';
    } else {
      nextStatus = 'HEALTHY';
      nextGamesOut = 0;
      nextStatusNote = null;
    }

    const played = box.minutes > 0;
    const prevGames = existing.seasonGamesPlayed;
    const nextGames = played ? prevGames + 1 : prevGames;
    const nextTotalFp = played
      ? Math.round((existing.seasonFantasyPoints + box.fantasyPoints) * 10) / 10
      : existing.seasonFantasyPoints;
    const nextPtsAvg = played
      ? Math.round(((existing.seasonPtsAvg * prevGames + box.pts) / nextGames) * 10) / 10
      : existing.seasonPtsAvg;
    const nextRebAvg = played
      ? Math.round(((existing.seasonRebAvg * prevGames + box.reb) / nextGames) * 10) / 10
      : existing.seasonRebAvg;
    const nextAstAvg = played
      ? Math.round(((existing.seasonAstAvg * prevGames + box.ast) / nextGames) * 10) / 10
      : existing.seasonAstAvg;

    let nextRole = existing.role;
    let nextOverall = existing.overallRating;

    if (played) {
      const avgFp = nextGames > 0 ? nextTotalFp / nextGames : 0;
      const prog = evaluatePlayerProgression({
        input: {
          age: existing.age,
          role: existing.role,
          overallRating: existing.overallRating,
          avgFantasyPoints: avgFp,
          gamesPlayed: nextGames,
        },
        teamAlreadyHasSuperstar: teamSuperstarCount.get(existing.currentTeamId) ?? false,
        config: PROVISIONAL_GAME_CONFIG.progression,
        rng: progressionRng,
      });
      nextOverall = prog.newOverallRating;
      nextRole = prog.newRole;
    }

    await tx.playerInstance.update({
      where: { id: existing.id },
      data: {
        status: nextStatus,
        gamesOutRemaining: nextGamesOut,
        statusNote: nextStatusNote,
        seasonGamesPlayed: nextGames,
        seasonFantasyPoints: nextTotalFp,
        seasonPtsAvg: nextPtsAvg,
        seasonRebAvg: nextRebAvg,
        seasonAstAvg: nextAstAvg,
        overallRating: nextOverall,
        role: nextRole,
      },
    });
  }

  await recordHumanTeamMailsInTx(tx, matchMails);

  return {
    alreadyCompleted: false,
    matchId: match.id,
    seasonId: match.seasonId,
    roundNumber: match.roundNumber,
    homeScore: simOutput.homeScore,
    awayScore: simOutput.awayScore,
  };
}

/**
 * Recalcula FantasyScore (SOLO 5 titulares alineados) de una jornada y actualiza
 * Standings y ranking en la liga de manera 100% aislada.
 */
export async function recalculateRoundStandingsInTx(
  tx: Prisma.TransactionClient,
  params: {
    readonly leagueId: string;
    readonly seasonId: string;
    readonly roundNumber: number;
  },
): Promise<void> {
  const { leagueId, seasonId, roundNumber } = params;

  const teams = await tx.leagueTeam.findMany({ where: { leagueId }, orderBy: { code: 'asc' } });
  const teamsById = new Map(teams.map((t) => [t.id, t]));
  const allPlayers = await tx.playerInstance.findMany({
    where: { leagueId, isRetired: false },
  });
  const roundStats = await tx.playerMatchStat.findMany({
    where: { leagueId, seasonId, roundNumber },
    include: { player: true },
  });
  const lineupsUpToRound = await tx.lineup.findMany({
    where: { leagueId, seasonId, roundNumber: { lte: roundNumber } },
    orderBy: { roundNumber: 'desc' },
  });
  const completedMatches = await tx.match.findMany({
    where: { leagueId, seasonId, status: 'FINAL' },
    orderBy: { roundNumber: 'asc' },
  });

  const effectiveLineupByTeam = new Map<string, (typeof lineupsUpToRound)[number]>();
  for (const l of lineupsUpToRound) {
    if (!effectiveLineupByTeam.has(l.leagueTeamId)) {
      effectiveLineupByTeam.set(l.leagueTeamId, l);
    }
  }

  const statByPlayerId = new Map(roundStats.map((s) => [s.playerInstanceId, s]));
  const rosterByTeam = new Map<string, (typeof allPlayers)[number][]>();
  for (const player of allPlayers) {
    const arr = rosterByTeam.get(player.currentTeamId) ?? [];
    arr.push(player);
    rosterByTeam.set(player.currentTeamId, arr);
  }

  const slotPositions: readonly Position[] = ['PG', 'SG', 'SF', 'PF', 'C'];

  const roundFpByTeam = new Map<string, number>();

  for (const team of teams) {
    const savedLineup = effectiveLineupByTeam.get(team.id);
    const roster = rosterByTeam.get(team.id) ?? [];

    let starterIds: Record<Position, string | null>;
    if (savedLineup) {
      starterIds = {
        PG: savedLineup.pgPlayerId,
        SG: savedLineup.sgPlayerId,
        SF: savedLineup.sfPlayerId,
        PF: savedLineup.pfPlayerId,
        C: savedLineup.cPlayerId,
      };
    } else if (roster.length >= 5) {
      const autoPick = pickDefaultLineupForTeam(
        roster.map((p) => ({
          id: p.id,
          position: p.position,
          overallRating: p.overallRating,
          status: p.status,
        })),
      );
      starterIds = {
        PG: autoPick.pgPlayerId,
        SG: autoPick.sgPlayerId,
        SF: autoPick.sfPlayerId,
        PF: autoPick.pfPlayerId,
        C: autoPick.cPlayerId,
      };
    } else {
      starterIds = { PG: null, SG: null, SF: null, PF: null, C: null };
    }

    let teamRoundFp = 0;
    const breakdown: Record<
      string,
      { playerId: string | null; playerName: string | null; fp: number }
    > = {};
    for (const pos of slotPositions) {
      const playerId = starterIds[pos];
      const stat = playerId ? statByPlayerId.get(playerId) : undefined;
      const fp = stat ? stat.fantasyPoints : 0;
      teamRoundFp += fp;
      breakdown[pos] = {
        playerId,
        playerName: stat?.player.name ?? null,
        fp: Math.round(fp * 10) / 10,
      };
    }

    teamRoundFp = Math.round(teamRoundFp * 10) / 10;
    roundFpByTeam.set(team.id, teamRoundFp);

    await tx.fantasyScore.upsert({
      where: {
        leagueId_seasonId_roundNumber_leagueTeamId: {
          leagueId,
          seasonId,
          roundNumber,
          leagueTeamId: team.id,
        },
      },
      update: {
        totalFp: teamRoundFp,
        breakdownJson: breakdown,
        calculatedAt: new Date(),
      },
      create: {
        leagueId,
        seasonId,
        roundNumber,
        leagueTeamId: team.id,
        totalFp: teamRoundFp,
        breakdownJson: breakdown,
      },
    });
  }

  const allSeasonScores = await tx.fantasyScore.findMany({
    where: { leagueId, seasonId },
    orderBy: { roundNumber: 'desc' },
  });

  const fpSumByTeam = new Map<string, number>();
  const lastFpByTeam = new Map<string, number>();
  const scoredRoundsByTeam = new Map<string, number>();
  for (const score of allSeasonScores) {
    fpSumByTeam.set(score.leagueTeamId, (fpSumByTeam.get(score.leagueTeamId) ?? 0) + score.totalFp);
    if (!lastFpByTeam.has(score.leagueTeamId)) {
      lastFpByTeam.set(score.leagueTeamId, score.totalFp);
    }
    scoredRoundsByTeam.set(
      score.leagueTeamId,
      (scoredRoundsByTeam.get(score.leagueTeamId) ?? 0) + 1,
    );
  }

  const winsByTeam = new Map<string, number>();
  const lossesByTeam = new Map<string, number>();
  const resultsByTeam = new Map<string, ('W' | 'L')[]>();

  for (const m of completedMatches) {
    if (m.homeScore === null || m.awayScore === null) {
      continue;
    }
    const homeWon = m.homeScore > m.awayScore;
    winsByTeam.set(m.homeTeamId, (winsByTeam.get(m.homeTeamId) ?? 0) + (homeWon ? 1 : 0));
    lossesByTeam.set(m.homeTeamId, (lossesByTeam.get(m.homeTeamId) ?? 0) + (homeWon ? 0 : 1));
    winsByTeam.set(m.awayTeamId, (winsByTeam.get(m.awayTeamId) ?? 0) + (homeWon ? 0 : 1));
    lossesByTeam.set(m.awayTeamId, (lossesByTeam.get(m.awayTeamId) ?? 0) + (homeWon ? 1 : 0));

    const homeHist = resultsByTeam.get(m.homeTeamId) ?? [];
    homeHist.push(homeWon ? 'W' : 'L');
    resultsByTeam.set(m.homeTeamId, homeHist.slice(-5));

    const awayHist = resultsByTeam.get(m.awayTeamId) ?? [];
    awayHist.push(homeWon ? 'L' : 'W');
    resultsByTeam.set(m.awayTeamId, awayHist.slice(-5));
  }

  const rankedTeams = teams
    .map((t) => {
      const totalFp = Math.round((fpSumByTeam.get(t.id) ?? 0) * 10) / 10;
      const lastRoundFp = Math.round((lastFpByTeam.get(t.id) ?? 0) * 10) / 10;
      const roundsCount = scoredRoundsByTeam.get(t.id) ?? 0;
      const avgFp = roundsCount > 0 ? Math.round((totalFp / roundsCount) * 10) / 10 : 0;
      const wins = winsByTeam.get(t.id) ?? 0;
      const losses = lossesByTeam.get(t.id) ?? 0;
      const lastFive = resultsByTeam.get(t.id) ?? [];
      return {
        team: t,
        totalFp,
        lastRoundFp,
        avgFp,
        wins,
        losses,
        lastFive,
      };
    })
    .sort((a, b) => {
      if (b.totalFp !== a.totalFp) {
        return b.totalFp - a.totalFp;
      }
      if (b.wins !== a.wins) {
        return b.wins - a.wins;
      }
      return a.team.code.localeCompare(b.team.code);
    });

  for (let idx = 0; idx < rankedTeams.length; idx += 1) {
    const entry = rankedTeams[idx];
    if (!entry) {
      continue;
    }
    const rank = idx + 1;
    await tx.standing.upsert({
      where: {
        leagueId_seasonId_leagueTeamId: {
          leagueId,
          seasonId,
          leagueTeamId: entry.team.id,
        },
      },
      update: {
        rank,
        fantasyPoints: entry.totalFp,
        lastRoundFp: entry.lastRoundFp,
        avgFp: entry.avgFp,
        wins: entry.wins,
        losses: entry.losses,
        lastFiveResults: [...entry.lastFive],
      },
      create: {
        leagueId,
        seasonId,
        leagueTeamId: entry.team.id,
        rank,
        fantasyPoints: entry.totalFp,
        lastRoundFp: entry.lastRoundFp,
        avgFp: entry.avgFp,
        wins: entry.wins,
        losses: entry.losses,
        lastFiveResults: [...entry.lastFive],
      },
    });

    await tx.leagueTeam.update({
      where: { id: entry.team.id },
      data: {
        totalFantasyPoints: entry.totalFp,
        wins: entry.wins,
        losses: entry.losses,
        rank,
      },
    });
  }

  // Recompensa económica por victoria en la jornada: Dream Points de la jornada x 1000
  const unpaidFinalMatches = await tx.match.findMany({
    where: {
      leagueId,
      seasonId,
      roundNumber,
      status: 'FINAL',
      winRewardPaid: false,
    },
  });

  const matchResultMails: CreateLeagueMailInput[] = [];

  for (const match of unpaidFinalMatches) {
    if (match.homeScore === null || match.awayScore === null) {
      continue;
    }

    let rewardMillions = 0;
    const isTie = match.homeScore === match.awayScore;
    const homeWon = match.homeScore > match.awayScore;
    if (!isTie) {
      const winnerTeamId = homeWon ? match.homeTeamId : match.awayTeamId;
      const winnerRoundFp = Math.max(0, roundFpByTeam.get(winnerTeamId) ?? 0);
      const rewardUnits = Math.round(
        winnerRoundFp * PROVISIONAL_GAME_CONFIG.economyAndMarket.winRewardPerFantasyPoint,
      );
      rewardMillions = rewardUnits / 1_000_000;

      if (rewardMillions > 0) {
        await tx.leagueTeam.update({
          where: { id: winnerTeamId },
          data: {
            budgetMillions: { increment: rewardMillions },
          },
        });
      }
    }

    await tx.match.update({
      where: { id: match.id },
      data: {
        winRewardPaid: true,
        winRewardMillions: rewardMillions,
      },
    });

    const homeTeam = teamsById.get(match.homeTeamId);
    const awayTeam = teamsById.get(match.awayTeamId);
    if (homeTeam && awayTeam) {
      matchResultMails.push(
        buildMatchResultMailInput({
          leagueId,
          seasonId,
          leagueTeamId: homeTeam.id,
          roundNumber,
          opponentTeamId: awayTeam.id,
          opponentTeamName: awayTeam.name,
          opponentTeamCode: awayTeam.code,
          isHome: true,
          teamScore: match.homeScore,
          opponentScore: match.awayScore,
          won: !isTie && homeWon,
          overtimeCount: match.overtimeCount,
          teamDreamPoints: roundFpByTeam.get(homeTeam.id) ?? 0,
          winRewardMillions: !isTie && homeWon ? rewardMillions : 0,
        }),
        buildMatchResultMailInput({
          leagueId,
          seasonId,
          leagueTeamId: awayTeam.id,
          roundNumber,
          opponentTeamId: homeTeam.id,
          opponentTeamName: homeTeam.name,
          opponentTeamCode: homeTeam.code,
          isHome: false,
          teamScore: match.awayScore,
          opponentScore: match.homeScore,
          won: !isTie && !homeWon,
          overtimeCount: match.overtimeCount,
          teamDreamPoints: roundFpByTeam.get(awayTeam.id) ?? 0,
          winRewardMillions: !isTie && !homeWon ? rewardMillions : 0,
        }),
      );
    }
  }

  await recordHumanTeamMailsInTx(tx, matchResultMails);
}

export interface SimulateRoundResult {
  readonly leagueId: string;
  readonly seasonId: string;
  readonly roundNumber: number;
  readonly matchesSimulated: number;
  readonly seasonCompleted: boolean;
}

async function ageActivePlayersIfNeededInTx(
  tx: Prisma.TransactionClient,
  params: {
    readonly leagueId: string;
    readonly seasonId: string;
    readonly alreadyAged: boolean;
  },
): Promise<boolean> {
  if (params.alreadyAged) {
    return false;
  }

  await tx.playerInstance.updateMany({
    where: { leagueId: params.leagueId, isRetired: false },
    data: { age: { increment: 1 } },
  });

  await tx.season.update({
    where: { id: params.seasonId },
    data: { playersAged: true },
  });

  return true;
}

/**
 * Simula todos los partidos pendientes de una jornada completa de una liga,
 * actualiza FantasyScores, Standings, avanza el reloj/ronda y prepara las
 * alineaciones humanas para la jornada siguiente.
 */
export async function simulateRoundForLeague(
  prisma: PrismaClient,
  params: {
    readonly leagueId: string;
    readonly roundNumber: number;
    readonly simulatedAt?: Date;
  },
): Promise<SimulateRoundResult> {
  return prisma.$transaction(
    async (tx) => {
      const season = await tx.season.findFirst({
        where: { leagueId: params.leagueId, status: 'ACTIVE' },
        orderBy: { seasonNumber: 'desc' },
      });
      if (!season) {
        throw new Error(`No hay temporada activa para la liga ${params.leagueId}`);
      }

      const matches = await tx.match.findMany({
        where: {
          leagueId: params.leagueId,
          seasonId: season.id,
          roundNumber: params.roundNumber,
        },
        orderBy: { scheduledAt: 'asc' },
      });

      let matchesSimulated = 0;
      let latestMatchAt = season.startedAt;

      for (const m of matches) {
        if (m.scheduledAt > latestMatchAt) {
          latestMatchAt = m.scheduledAt;
        }
        const simRes = await simulateSingleMatchInTx(tx, {
          leagueId: params.leagueId,
          matchId: m.id,
          ...(params.simulatedAt ? { simulatedAt: params.simulatedAt } : {}),
        });
        if (!simRes.alreadyCompleted) {
          matchesSimulated += 1;
        }
      }

      await recalculateRoundStandingsInTx(tx, {
        leagueId: params.leagueId,
        seasonId: season.id,
        roundNumber: params.roundNumber,
      });

      const nextRoundNumber = Math.max(season.currentRoundNumber, params.roundNumber);
      await tx.season.update({
        where: { id: season.id },
        data: { currentRoundNumber: nextRoundNumber },
      });

      const league = await tx.league.findUnique({ where: { id: params.leagueId } });
      if (league && latestMatchAt > league.gameClockAt) {
        await tx.league.update({
          where: { id: league.id },
          data: { gameClockAt: latestMatchAt },
        });
      }

      // Bloqueamos la alineación de la jornada simulada y copiamos titulares a round+1
      await tx.lineup.updateMany({
        where: {
          leagueId: params.leagueId,
          seasonId: season.id,
          roundNumber: params.roundNumber,
        },
        data: { isLocked: true },
      });

      if (params.roundNumber < season.totalRounds) {
        const nextRound = params.roundNumber + 1;
        const currentLineups = await tx.lineup.findMany({
          where: {
            leagueId: params.leagueId,
            seasonId: season.id,
            roundNumber: params.roundNumber,
          },
        });
        for (const l of currentLineups) {
          const existsNext = await tx.lineup.findUnique({
            where: {
              leagueId_seasonId_leagueTeamId_roundNumber: {
                leagueId: params.leagueId,
                seasonId: season.id,
                leagueTeamId: l.leagueTeamId,
                roundNumber: nextRound,
              },
            },
          });
          if (!existsNext) {
            await tx.lineup.create({
              data: {
                leagueId: params.leagueId,
                seasonId: season.id,
                leagueTeamId: l.leagueTeamId,
                roundNumber: nextRound,
                pgPlayerId: l.pgPlayerId,
                sgPlayerId: l.sgPlayerId,
                sfPlayerId: l.sfPlayerId,
                pfPlayerId: l.pfPlayerId,
                cPlayerId: l.cPlayerId,
                isLocked: false,
              },
            });
          }
        }
      }

      if (matchesSimulated > 0) {
        await repriceLeagueMarketInTx(tx, {
          leagueId: params.leagueId,
          reason: `Post-jornada ${String(params.roundNumber)}`,
        });
        await runAutonomousCpuTransfersInTx(tx, {
          leagueId: params.leagueId,
          seasonId: season.id,
          roundNumber: params.roundNumber,
        });
      }

      let seasonCompleted = false;
      if (nextRoundNumber >= season.totalRounds) {
        const remainingScheduled = await tx.match.count({
          where: {
            leagueId: params.leagueId,
            seasonId: season.id,
            status: 'SCHEDULED',
          },
        });
        if (remainingScheduled === 0) {
          seasonCompleted = true;
          await ageActivePlayersIfNeededInTx(tx, {
            leagueId: params.leagueId,
            seasonId: season.id,
            alreadyAged: season.playersAged,
          });
        }
      }

      return {
        leagueId: params.leagueId,
        seasonId: season.id,
        roundNumber: params.roundNumber,
        matchesSimulated,
        seasonCompleted,
      };
    },
    { timeout: 60000, maxWait: 15000 },
  );
}

/**
 * Recalcula precios de mercado de los 540 jugadores activos de una liga concreta dentro de una transacción.
 */
export async function repriceLeagueMarketInTx(
  tx: Prisma.TransactionClient,
  params: { readonly leagueId: string; readonly reason: string },
): Promise<{ readonly updatedPlayersCount: number }> {
  const season = await tx.season.findFirst({
    where: { leagueId: params.leagueId, status: 'ACTIVE' },
    orderBy: { seasonNumber: 'desc' },
  });

  const players = await tx.playerInstance.findMany({
    where: { leagueId: params.leagueId, isRetired: false },
  });

  const lastFpByPlayer = new Map<string, number>();
  if (season && season.currentRoundNumber > 0) {
    const recentStats = await tx.playerMatchStat.findMany({
      where: {
        leagueId: params.leagueId,
        seasonId: season.id,
        roundNumber: season.currentRoundNumber,
      },
    });
    for (const stat of recentStats) {
      lastFpByPlayer.set(stat.playerInstanceId, stat.fantasyPoints);
    }
  }

  const results = recalculateMarketPrices({
    players: players.map((p) => ({
      playerId: p.id,
      position: p.position,
      role: p.role,
      age: p.age,
      status: p.status,
      currentPriceMillions: p.priceMillions,
      avgFantasyPoints:
        p.seasonGamesPlayed > 0
          ? p.seasonFantasyPoints / p.seasonGamesPlayed
          : Math.max(2, Math.pow(Math.max(0.5, p.priceMillions) / 2.38, 1 / 1.72) * 10),
      lastRoundFantasyPoints: lastFpByPlayer.get(p.id) ?? null,
    })),
    config: {
      sensitivity: PROVISIONAL_GAME_CONFIG.economyAndMarket.hourlyRepriceSensitivity,
      minPriceMillions: PROVISIONAL_GAME_CONFIG.economyAndMarket.minPlayerPriceMillions,
      maxPriceMillions: PROVISIONAL_GAME_CONFIG.economyAndMarket.maxPlayerPriceMillions,
    },
  });

  const playerById = new Map(players.map((p) => [p.id, p]));
  const historyRows: Prisma.MarketHistoryCreateManyInput[] = [];
  let updatedCount = 0;

  for (const res of results) {
    const existing = playerById.get(res.playerId);
    if (Math.abs(res.deltaMillions) < 0.05) {
      if (existing && existing.priceDeltaMillions !== 0) {
        await tx.playerInstance.update({
          where: { id: res.playerId },
          data: { priceDeltaMillions: 0 },
        });
      }
      continue;
    }
    updatedCount += 1;
    await tx.playerInstance.update({
      where: { id: res.playerId },
      data: {
        priceMillions: res.newPriceMillions,
        priceDeltaMillions: res.deltaMillions,
      },
    });
    historyRows.push({
      leagueId: params.leagueId,
      playerInstanceId: res.playerId,
      priceMillions: res.newPriceMillions,
      deltaMillions: res.deltaMillions,
      reason: params.reason,
    });
  }

  if (historyRows.length > 0) {
    await tx.marketHistory.createMany({ data: historyRows });
  }

  return { updatedPlayersCount: updatedCount };
}

/**
 * Recalcula precios de mercado de los 540 jugadores de una liga concreta.
 */
export async function repriceLeagueMarket(
  prisma: PrismaClient,
  params: { readonly leagueId: string; readonly reason: string },
): Promise<{ readonly updatedPlayersCount: number }> {
  return prisma.$transaction((tx) => repriceLeagueMarketInTx(tx, params), {
    timeout: 30000,
    maxWait: 10000,
  });
}

function getRetirementProbability(age: number): number {
  if (age >= 40) {
    return 1;
  }
  if (age === 39) {
    return 0.8;
  }
  if (age >= 37) {
    return 0.45;
  }
  if (age >= 35) {
    return 0.18;
  }
  return 0;
}

async function processSeasonRetirementsAndRookiesInTx(
  tx: Prisma.TransactionClient,
  params: {
    readonly leagueId: string;
    readonly completedSeasonNumber: number;
    readonly nextSeasonId: string;
    readonly nextSeasonNumber: number;
    readonly simulationSeed: string;
    readonly teams: readonly {
      readonly id: string;
      readonly name: string;
      readonly code: string;
    }[];
  },
): Promise<{ readonly retiredCount: number }> {
  const { leagueId, completedSeasonNumber, nextSeasonId, nextSeasonNumber, simulationSeed, teams } =
    params;
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const [activePlayers, allNamedPlayers] = await Promise.all([
    tx.playerInstance.findMany({
      where: { leagueId, isRetired: false },
      orderBy: [{ age: 'desc' }, { name: 'asc' }],
    }),
    tx.playerInstance.findMany({
      where: { leagueId },
      select: { name: true },
    }),
  ]);

  const usedNames = new Set(allNamedPlayers.map((p) => p.name));
  const rng = createSeededRng(`${simulationSeed}:retirements:s${String(completedSeasonNumber)}`);
  const retiredIds: string[] = [];
  const retirementMails: CreateLeagueMailInput[] = [];
  let rookieCounter = 0;

  for (const veteran of activePlayers) {
    const probability = getRetirementProbability(veteran.age);
    if (probability <= 0) {
      continue;
    }
    if (probability < 1 && rng.nextFloat() >= probability) {
      continue;
    }

    const team = teamById.get(veteran.currentTeamId);
    if (!team) {
      continue;
    }

    retiredIds.push(veteran.id);
    rookieCounter += 1;

    await tx.playerInstance.update({
      where: { id: veteran.id },
      data: {
        isRetired: true,
        retiredSeasonNumber: completedSeasonNumber,
        tradeLockTeamId: null,
        tradeLockUntilTeamMatches: null,
      },
    });

    await tx.rosterSlot.deleteMany({
      where: { leagueId, playerInstanceId: veteran.id },
    });

    const rookieBp = generateReplacementRookieBlueprint({
      seed: `${simulationSeed}:rookie:s${String(nextSeasonNumber)}:${team.code}:${String(rookieCounter)}`,
      teamCode: team.code,
      position: veteran.position,
      existingNames: usedNames,
      slotIndex: rookieCounter,
      seasonNumber: nextSeasonNumber,
    });
    usedNames.add(rookieBp.fullName);

    const rookieId = randomUUID();
    await tx.playerInstance.create({
      data: {
        id: rookieId,
        leagueId,
        templatePlayerId: null,
        currentTeamId: team.id,
        name: rookieBp.fullName,
        initials: rookieBp.initials,
        position: rookieBp.position,
        role: 'ROOKIE',
        age: rookieBp.age,
        priceMillions: rookieBp.basePriceMillions,
        priceDeltaMillions: 0,
        status: 'HEALTHY',
        gamesOutRemaining: 0,
        overallRating: rookieBp.overallRating,
        offense: rookieBp.offense,
        defense: rookieBp.defense,
        playmaking: rookieBp.playmaking,
        rebounding: rookieBp.rebounding,
        athleticism: rookieBp.athleticism,
        iq: rookieBp.iq,
        isRetired: false,
      },
    });

    await tx.rosterSlot.create({
      data: {
        leagueId,
        leagueTeamId: team.id,
        playerInstanceId: rookieId,
      },
    });

    retirementMails.push(
      buildRetirementReplacementMailInput({
        leagueId,
        seasonId: nextSeasonId,
        leagueTeamId: team.id,
        seasonNumber: nextSeasonNumber,
        teamName: team.name,
        retiredPlayerName: veteran.name,
        retiredAge: veteran.age,
        retiredPosition: veteran.position,
        retiredOverall: veteran.overallRating,
        rookiePlayerId: rookieId,
        rookiePlayerName: rookieBp.fullName,
        rookieAge: rookieBp.age,
        rookiePosition: rookieBp.position,
        rookieOverall: rookieBp.overallRating,
        rookiePriceMillions: rookieBp.basePriceMillions,
      }),
    );
  }

  if (retiredIds.length > 0) {
    await tx.transferOffer.updateMany({
      where: {
        leagueId,
        status: 'PENDING',
        OR: [
          { offeredPlayerIds: { hasSome: retiredIds } },
          { requestedPlayerIds: { hasSome: retiredIds } },
        ],
      },
      data: {
        status: 'CANCELLED',
        respondedAt: new Date(),
        responseNote: 'Cancelled automatically due to player retirement.',
      },
    });
  }

  await recordHumanTeamMailsInTx(tx, retirementMails);

  return { retiredCount: retiredIds.length };
}

/**
 * Cierra la temporada actual e inicia la siguiente (mes siguiente) conservando
 * jugadores e historial, según políticas de SeasonResetConfig.
 */
export async function advanceSeasonForLeague(
  prisma: PrismaClient,
  params: {
    readonly leagueId: string;
    readonly resetConfig?: SeasonResetConfig;
  },
): Promise<{
  readonly previousSeasonId: string;
  readonly newSeasonId: string;
  readonly newSeasonNumber: number;
}> {
  const config = params.resetConfig ?? PROVISIONAL_GAME_CONFIG.seasonReset;

  return prisma.$transaction(
    async (tx) => {
      const league = await tx.league.findUnique({ where: { id: params.leagueId } });
      if (!league) {
        throw new Error(`Liga ${params.leagueId} no encontrada`);
      }

      const currentSeason = await tx.season.findFirst({
        where: { leagueId: params.leagueId, status: 'ACTIVE' },
        orderBy: { seasonNumber: 'desc' },
      });
      if (!currentSeason) {
        throw new Error(`No hay temporada activa en la liga ${params.leagueId}`);
      }

      await ageActivePlayersIfNeededInTx(tx, {
        leagueId: params.leagueId,
        seasonId: currentSeason.id,
        alreadyAged: currentSeason.playersAged,
      });

      const prevStandings = await tx.standing.findMany({
        where: { leagueId: params.leagueId, seasonId: currentSeason.id },
        include: { team: true },
        orderBy: { rank: 'asc' },
      });

      const now = new Date();
      await tx.season.update({
        where: { id: currentSeason.id },
        data: {
          status: 'COMPLETED',
          endedAt: now,
        },
      });

      // Borramos todos los correos de temporadas anteriores al concluir una liga para ahorrar espacio
      await tx.leagueMail.deleteMany({
        where: { leagueId: params.leagueId },
      });

      const nextMonth = currentSeason.calendarMonth === 12 ? 1 : currentSeason.calendarMonth + 1;
      const nextYear =
        currentSeason.calendarMonth === 12
          ? currentSeason.calendarYear + 1
          : currentSeason.calendarYear;
      const nextDaysInMonth = getDaysInCalendarMonth(nextYear, nextMonth);
      const nextSeasonNumber = currentSeason.seasonNumber + 1;
      const newClock = new Date(Date.UTC(nextYear, nextMonth - 1, 1, 7, 30, 0, 0));

      const newSeason = await tx.season.create({
        data: {
          leagueId: params.leagueId,
          seasonNumber: nextSeasonNumber,
          name: formatSpanishSeasonName(nextSeasonNumber, nextYear, nextMonth),
          calendarYear: nextYear,
          calendarMonth: nextMonth,
          daysInMonth: nextDaysInMonth,
          totalRounds: LEAGUE_RULES.seasonTotalRounds,
          currentRoundNumber: 0,
          status: 'ACTIVE',
          playersAged: false,
          startedAt: newClock,
        },
      });

      await tx.league.update({
        where: { id: params.leagueId },
        data: { gameClockAt: newClock },
      });

      if (config.resetFantasyPoints) {
        await tx.playerInstance.updateMany({
          where: { leagueId: params.leagueId, isRetired: false },
          data: {
            seasonGamesPlayed: 0,
            seasonFantasyPoints: 0,
            seasonPtsAvg: 0,
            seasonRebAvg: 0,
            seasonAstAvg: 0,
          },
        });
      }

      if (config.resetInjuriesAndSuspensions) {
        await tx.injury.updateMany({
          where: { leagueId: params.leagueId, active: true },
          data: { active: false, gamesRemaining: 0, resolvedAt: now },
        });
        await tx.suspension.updateMany({
          where: { leagueId: params.leagueId, active: true },
          data: { active: false, gamesRemaining: 0, resolvedAt: now },
        });
        await tx.playerInstance.updateMany({
          where: { leagueId: params.leagueId, isRetired: false },
          data: {
            status: 'HEALTHY',
            gamesOutRemaining: 0,
            statusNote: null,
          },
        });
      }

      const teams = await tx.leagueTeam.findMany({
        where: { leagueId: params.leagueId },
        orderBy: { code: 'asc' },
      });

      await processSeasonRetirementsAndRookiesInTx(tx, {
        leagueId: params.leagueId,
        completedSeasonNumber: currentSeason.seasonNumber,
        nextSeasonId: newSeason.id,
        nextSeasonNumber,
        simulationSeed: league.simulationSeed,
        teams,
      });

      const champion = prevStandings[0]?.team.name ?? 'TBD';
      const summaryMails: CreateLeagueMailInput[] = teams
        .filter((team) => !team.isCpuControlled)
        .map((team) => {
          const prev = prevStandings.find((s) => s.leagueTeamId === team.id);
          const recordLabel = prev
            ? `#${String(prev.rank)} (${String(prev.wins)}-${String(prev.losses)}, ${prev.fantasyPoints.toFixed(1)} DP)`
            : 'N/A';
          return {
            leagueId: params.leagueId,
            seasonId: newSeason.id,
            leagueTeamId: team.id,
            roundNumber: null,
            category: 'SEASON_SUMMARY',
            subject: `Welcome to Season ${String(nextSeasonNumber)} — ${league.name}`,
            body: `Season ${String(currentSeason.seasonNumber)} has concluded (Champion: ${champion}; ${team.name} finished ${recordLabel}). Every active player aged +1 year and Season ${String(nextSeasonNumber)} fixtures are now scheduled.`,
            metadata: {
              previousSeasonNumber: currentSeason.seasonNumber,
              nextSeasonNumber,
              championTeamName: champion,
              previousRank: prev?.rank ?? null,
              previousWins: prev?.wins ?? null,
              previousLosses: prev?.losses ?? null,
              previousFantasyPoints: prev?.fantasyPoints ?? null,
            },
          };
        });
      await recordHumanTeamMailsInTx(tx, summaryMails);

      if (config.resetStandings) {
        for (let idx = 0; idx < teams.length; idx += 1) {
          const team = teams[idx];
          if (!team) {
            continue;
          }
          await tx.leagueTeam.update({
            where: { id: team.id },
            data: {
              totalFantasyPoints: 0,
              wins: 0,
              losses: 0,
              rank: idx + 1,
              ...(config.resetBudgetToInitial
                ? {
                    budgetMillions:
                      PROVISIONAL_GAME_CONFIG.economyAndMarket.initialTeamBudgetMillions,
                  }
                : {}),
            },
          });
        }
      }

      await tx.standing.createMany({
        data: teams.map((t, idx) => ({
          leagueId: params.leagueId,
          seasonId: newSeason.id,
          leagueTeamId: t.id,
          rank: idx + 1,
          fantasyPoints: 0,
          lastRoundFp: 0,
          avgFp: 0,
          wins: 0,
          losses: 0,
          lastFiveResults: [],
        })),
      });

      const fixtures = generateDoubleRoundRobinFixtures({
        teamIds: teams.map((t) => t.id),
        year: nextYear,
        month: nextMonth,
        startHour: LEAGUE_RULES.dailyWindowStartHour,
        endHour: LEAGUE_RULES.dailyWindowEndHour,
      });

      await tx.match.createMany({
        data: fixtures.map((f) => ({
          leagueId: params.leagueId,
          seasonId: newSeason.id,
          roundNumber: f.roundNumber,
          scheduledAt: new Date(f.scheduledAtIso),
          status: 'SCHEDULED',
          homeTeamId: f.homeTeamId,
          awayTeamId: f.awayTeamId,
          seed: `${league.simulationSeed}:s${String(nextSeasonNumber)}:r${String(f.roundNumber)}:m${String(f.matchIndexInRound)}`,
        })),
      });

      // Copiamos alineación base para equipos humanos en la jornada 1 de la nueva temporada (excluyendo retirados)
      const humanMembers = await tx.leagueMember.findMany({
        where: { leagueId: params.leagueId },
      });
      const allPlayers = await tx.playerInstance.findMany({
        where: { leagueId: params.leagueId, isRetired: false },
      });

      for (const m of humanMembers) {
        const teamRoster = allPlayers.filter((p) => p.currentTeamId === m.leagueTeamId);
        if (teamRoster.length >= 5) {
          const picked = pickDefaultLineupForTeam(
            teamRoster.map((p) => ({
              id: p.id,
              position: p.position,
              overallRating: p.overallRating,
              status: p.status,
            })),
          );
          await tx.lineup.create({
            data: {
              leagueId: params.leagueId,
              seasonId: newSeason.id,
              leagueTeamId: m.leagueTeamId,
              roundNumber: 1,
              pgPlayerId: picked.pgPlayerId,
              sgPlayerId: picked.sgPlayerId,
              sfPlayerId: picked.sfPlayerId,
              pfPlayerId: picked.pfPlayerId,
              cPlayerId: picked.cPlayerId,
              isLocked: false,
            },
          });
        }
      }

      return {
        previousSeasonId: currentSeason.id,
        newSeasonId: newSeason.id,
        newSeasonNumber: nextSeasonNumber,
      };
    },
    { timeout: 60000, maxWait: 15000 },
  );
}

export interface SyncClockResult {
  readonly previousGameClockAt: string;
  readonly newGameClockAt: string;
  readonly activeSeasonNumber: number;
  readonly activeSeasonName: string;
  readonly currentRoundNumber: number;
  readonly deletedFutureSeasonsCount: number;
  readonly revertedMatchesCount: number;
}

/**
 * Sincroniza el reloj simulado de la liga con la fecha y hora reales actuales (`now`),
 * revirtiendo o eliminando temporadas, partidos, estadísticas, premios económicos,
 * correos y movimientos posteriores a `now`.
 */
export async function syncLeagueClockToRealTime(
  prisma: PrismaClient,
  params: {
    readonly leagueId: string;
    readonly now?: Date;
  },
): Promise<SyncClockResult> {
  const now = params.now ?? new Date();
  const nowYear = now.getUTCFullYear();
  const nowMonth = now.getUTCMonth() + 1;
  const nowMonthStart = new Date(Date.UTC(nowYear, nowMonth - 1, 1, 7, 30, 0, 0));

  return prisma.$transaction(
    async (tx) => {
      const league = await tx.league.findUnique({ where: { id: params.leagueId } });
      if (!league) {
        throw new Error(`Liga ${params.leagueId} no encontrada`);
      }

      const previousGameClockAt = league.gameClockAt.toISOString();
      const seasons = await tx.season.findMany({
        where: { leagueId: params.leagueId },
        orderBy: { seasonNumber: 'asc' },
      });
      if (seasons.length === 0) {
        throw new Error(`La liga ${params.leagueId} no tiene temporadas registradas`);
      }

      const survivingSeasons = seasons.filter(
        (s) =>
          s.calendarYear < nowYear || (s.calendarYear === nowYear && s.calendarMonth <= nowMonth),
      );
      const allSeasonsWereInFuture = survivingSeasons.length === 0;
      const targetSeason = allSeasonsWereInFuture
        ? seasons[0]
        : survivingSeasons[survivingSeasons.length - 1];
      if (!targetSeason) {
        throw new Error(`No se pudo resolver temporada objetivo en la liga ${params.leagueId}`);
      }
      const futureSeasons = seasons.filter((s) => s.seasonNumber > targetSeason.seasonNumber);

      if (futureSeasons.length > 0) {
        const futureSeasonIds = futureSeasons.map((s) => s.id);
        const futureSeasonMatches = await tx.match.findMany({
          where: { leagueId: params.leagueId, seasonId: { in: futureSeasonIds } },
          select: { id: true },
        });
        const futureMatchIds = futureSeasonMatches.map((m) => m.id);

        await tx.leagueMail.deleteMany({
          where: { leagueId: params.leagueId, seasonId: { in: futureSeasonIds } },
        });
        await tx.simulationJob.deleteMany({
          where: { leagueId: params.leagueId, seasonId: { in: futureSeasonIds } },
        });
        if (futureMatchIds.length > 0) {
          await tx.matchEvent.deleteMany({
            where: { leagueId: params.leagueId, matchId: { in: futureMatchIds } },
          });
          await tx.playerMatchStat.deleteMany({
            where: { leagueId: params.leagueId, matchId: { in: futureMatchIds } },
          });
          await tx.teamMatchStat.deleteMany({
            where: { leagueId: params.leagueId, matchId: { in: futureMatchIds } },
          });
          await tx.injury.deleteMany({
            where: { leagueId: params.leagueId, matchId: { in: futureMatchIds } },
          });
          await tx.suspension.deleteMany({
            where: { leagueId: params.leagueId, matchId: { in: futureMatchIds } },
          });
        }
        await tx.fantasyScore.deleteMany({
          where: { leagueId: params.leagueId, seasonId: { in: futureSeasonIds } },
        });
        await tx.standing.deleteMany({
          where: { leagueId: params.leagueId, seasonId: { in: futureSeasonIds } },
        });
        await tx.lineup.deleteMany({
          where: { leagueId: params.leagueId, seasonId: { in: futureSeasonIds } },
        });
        await tx.match.deleteMany({
          where: { leagueId: params.leagueId, seasonId: { in: futureSeasonIds } },
        });
        await tx.season.deleteMany({
          where: { id: { in: futureSeasonIds } },
        });

        // Revertir envejecimiento o retiradas prematuras provocadas por temporadas futuras
        const agedRolloversToUndo = [targetSeason, ...futureSeasons].filter(
          (s) => s.playersAged,
        ).length;
        const veteransToRestore = await tx.playerInstance.findMany({
          where: {
            leagueId: params.leagueId,
            isRetired: true,
            retiredSeasonNumber: { gte: targetSeason.seasonNumber },
          },
        });
        for (const vet of veteransToRestore) {
          await tx.playerInstance.update({
            where: { id: vet.id },
            data: { isRetired: false, retiredSeasonNumber: null },
          });
          await tx.rosterSlot.upsert({
            where: {
              playerInstanceId_leagueId: {
                playerInstanceId: vet.id,
                leagueId: params.leagueId,
              },
            },
            update: { leagueTeamId: vet.currentTeamId },
            create: {
              leagueId: params.leagueId,
              leagueTeamId: vet.currentTeamId,
              playerInstanceId: vet.id,
            },
          });

          const excessRookie = await tx.playerInstance.findFirst({
            where: {
              leagueId: params.leagueId,
              currentTeamId: vet.currentTeamId,
              templatePlayerId: null,
              role: 'ROOKIE',
              isRetired: false,
            },
            orderBy: { name: 'desc' },
          });
          if (excessRookie) {
            await tx.lineup.updateMany({
              where: { leagueId: params.leagueId, pgPlayerId: excessRookie.id },
              data: { pgPlayerId: null },
            });
            await tx.lineup.updateMany({
              where: { leagueId: params.leagueId, sgPlayerId: excessRookie.id },
              data: { sgPlayerId: null },
            });
            await tx.lineup.updateMany({
              where: { leagueId: params.leagueId, sfPlayerId: excessRookie.id },
              data: { sfPlayerId: null },
            });
            await tx.lineup.updateMany({
              where: { leagueId: params.leagueId, pfPlayerId: excessRookie.id },
              data: { pfPlayerId: null },
            });
            await tx.lineup.updateMany({
              where: { leagueId: params.leagueId, cPlayerId: excessRookie.id },
              data: { cPlayerId: null },
            });
            await tx.rosterSlot.deleteMany({
              where: { leagueId: params.leagueId, playerInstanceId: excessRookie.id },
            });
            await tx.marketHistory.deleteMany({
              where: { leagueId: params.leagueId, playerInstanceId: excessRookie.id },
            });
            await tx.playerMatchStat.deleteMany({
              where: { leagueId: params.leagueId, playerInstanceId: excessRookie.id },
            });
            await tx.playerInstance.delete({ where: { id: excessRookie.id } });
          }
        }

        if (agedRolloversToUndo > 0) {
          const currentPlayers = await tx.playerInstance.findMany({
            where: { leagueId: params.leagueId, isRetired: false },
            select: { id: true, age: true },
          });
          for (const p of currentPlayers) {
            await tx.playerInstance.update({
              where: { id: p.id },
              data: { age: Math.max(18, p.age - agedRolloversToUndo) },
            });
          }
        }
      }

      let activeSeasonName = targetSeason.name;
      if (allSeasonsWereInFuture) {
        const daysInMonth = getDaysInCalendarMonth(nowYear, nowMonth);
        activeSeasonName = formatSpanishSeasonName(targetSeason.seasonNumber, nowYear, nowMonth);
        await tx.season.update({
          where: { id: targetSeason.id },
          data: {
            name: activeSeasonName,
            calendarYear: nowYear,
            calendarMonth: nowMonth,
            daysInMonth,
            startedAt: nowMonthStart,
            status: 'ACTIVE',
            endedAt: null,
            playersAged: false,
          },
        });

        const roundCalendar = distributeRoundsAcrossMonth({
          year: nowYear,
          month: nowMonth,
          startHour: LEAGUE_RULES.dailyWindowStartHour,
          endHour: LEAGUE_RULES.dailyWindowEndHour,
        });
        const roundIsoByNumber = new Map(
          roundCalendar.map((r) => [r.roundNumber, Date.parse(r.scheduledAtIso)]),
        );
        const seasonMatches = await tx.match.findMany({
          where: { leagueId: params.leagueId, seasonId: targetSeason.id },
          orderBy: [{ roundNumber: 'asc' }, { id: 'asc' }],
        });
        const seenInRound = new Map<number, number>();
        for (const m of seasonMatches) {
          const baseMs = roundIsoByNumber.get(m.roundNumber) ?? now.getTime();
          const idx = seenInRound.get(m.roundNumber) ?? 0;
          seenInRound.set(m.roundNumber, idx + 1);
          await tx.match.update({
            where: { id: m.id },
            data: { scheduledAt: new Date(baseMs + idx * 120_000) },
          });
        }
      } else {
        await tx.season.update({
          where: { id: targetSeason.id },
          data: {
            status: 'ACTIVE',
            endedAt: null,
            playersAged: false,
          },
        });
      }

      const seasonMatchesAfterReschedule = await tx.match.findMany({
        where: { leagueId: params.leagueId, seasonId: targetSeason.id },
        orderBy: [{ roundNumber: 'asc' }, { scheduledAt: 'asc' }],
      });

      const futureOrPostdatedSimulated = seasonMatchesAfterReschedule.filter(
        (m) =>
          m.status !== 'SCHEDULED' &&
          (allSeasonsWereInFuture ||
            m.scheduledAt > now ||
            (m.simulatedAt !== null && m.simulatedAt > now)),
      );
      const firstRevertedRound =
        futureOrPostdatedSimulated.length > 0
          ? Math.min(...futureOrPostdatedSimulated.map((m) => m.roundNumber))
          : null;

      const matchesToRevert =
        firstRevertedRound !== null
          ? seasonMatchesAfterReschedule.filter(
              (m) => m.status !== 'SCHEDULED' && m.roundNumber >= firstRevertedRound,
            )
          : [];
      const revertedMatchIds = matchesToRevert.map((m) => m.id);

      if (revertedMatchIds.length > 0) {
        const refundByTeam = new Map<string, number>();
        for (const m of matchesToRevert) {
          if (
            m.winRewardPaid &&
            typeof m.winRewardMillions === 'number' &&
            m.winRewardMillions > 0 &&
            m.homeScore !== null &&
            m.awayScore !== null &&
            m.homeScore !== m.awayScore
          ) {
            const winnerId = m.homeScore > m.awayScore ? m.homeTeamId : m.awayTeamId;
            refundByTeam.set(winnerId, (refundByTeam.get(winnerId) ?? 0) + m.winRewardMillions);
          }
        }
        for (const [teamId, refund] of refundByTeam.entries()) {
          const teamRow = await tx.leagueTeam.findUnique({
            where: { id: teamId },
            select: { budgetMillions: true },
          });
          if (teamRow) {
            await tx.leagueTeam.update({
              where: { id: teamId },
              data: {
                budgetMillions: Math.max(0, Number((teamRow.budgetMillions - refund).toFixed(2))),
              },
            });
          }
        }

        await tx.matchEvent.deleteMany({
          where: { leagueId: params.leagueId, matchId: { in: revertedMatchIds } },
        });
        await tx.playerMatchStat.deleteMany({
          where: { leagueId: params.leagueId, matchId: { in: revertedMatchIds } },
        });
        await tx.teamMatchStat.deleteMany({
          where: { leagueId: params.leagueId, matchId: { in: revertedMatchIds } },
        });
        await tx.injury.deleteMany({
          where: { leagueId: params.leagueId, matchId: { in: revertedMatchIds } },
        });
        await tx.suspension.deleteMany({
          where: { leagueId: params.leagueId, matchId: { in: revertedMatchIds } },
        });
        await tx.match.updateMany({
          where: { id: { in: revertedMatchIds } },
          data: {
            status: 'SCHEDULED',
            simulatedAt: null,
            homeScore: null,
            awayScore: null,
            overtimeCount: 0,
            winRewardPaid: false,
            winRewardMillions: null,
          },
        });
      }

      const refreshedMatches = await tx.match.findMany({
        where: { leagueId: params.leagueId, seasonId: targetSeason.id },
        orderBy: [{ roundNumber: 'asc' }, { scheduledAt: 'asc' }],
      });
      const matchesByRound = new Map<number, (typeof refreshedMatches)[number][]>();
      for (const m of refreshedMatches) {
        const list = matchesByRound.get(m.roundNumber) ?? [];
        list.push(m);
        matchesByRound.set(m.roundNumber, list);
      }
      let highestCompletedRound = 0;
      for (let r = 1; r <= targetSeason.totalRounds; r += 1) {
        const roundMatches = matchesByRound.get(r) ?? [];
        if (roundMatches.length > 0 && roundMatches.every((m) => m.status === 'FINAL')) {
          highestCompletedRound = r;
        } else {
          break;
        }
      }

      await tx.fantasyScore.deleteMany({
        where: {
          leagueId: params.leagueId,
          seasonId: targetSeason.id,
          roundNumber: { gt: highestCompletedRound },
        },
      });
      await tx.lineup.deleteMany({
        where: {
          leagueId: params.leagueId,
          seasonId: targetSeason.id,
          roundNumber: { gt: highestCompletedRound + 1 },
        },
      });
      await tx.lineup.updateMany({
        where: {
          leagueId: params.leagueId,
          seasonId: targetSeason.id,
          roundNumber: Math.min(targetSeason.totalRounds, highestCompletedRound + 1),
        },
        data: { isLocked: false },
      });

      await tx.leagueMail.deleteMany({
        where: {
          leagueId: params.leagueId,
          OR: [
            { createdAt: { gt: now } },
            { roundNumber: { gt: highestCompletedRound } },
            { seasonId: { not: targetSeason.id } },
          ],
        },
      });

      const marketEntries = await tx.marketHistory.findMany({
        where: { leagueId: params.leagueId },
        orderBy: { recordedAt: 'desc' },
      });
      const invalidMarketIds = marketEntries
        .filter((entry) => {
          if (entry.recordedAt > now) return true;
          const matchRound = /^Post-jornada (\d+)/.exec(entry.reason);
          if (matchRound?.[1]) {
            const roundNum = Number.parseInt(matchRound[1], 10);
            if (roundNum > highestCompletedRound) return true;
          }
          return false;
        })
        .map((e) => e.id);
      if (invalidMarketIds.length > 0) {
        await tx.marketHistory.deleteMany({
          where: { id: { in: invalidMarketIds } },
        });
      }

      const survivingStats = await tx.playerMatchStat.findMany({
        where: { leagueId: params.leagueId, seasonId: targetSeason.id },
      });
      const statsAggByPlayer = new Map<
        string,
        { gp: number; fp: number; pts: number; reb: number; ast: number }
      >();
      for (const s of survivingStats) {
        const cur = statsAggByPlayer.get(s.playerInstanceId) ?? {
          gp: 0,
          fp: 0,
          pts: 0,
          reb: 0,
          ast: 0,
        };
        cur.gp += 1;
        cur.fp += s.fantasyPoints;
        cur.pts += s.pts;
        cur.reb += s.reb;
        cur.ast += s.ast;
        statsAggByPlayer.set(s.playerInstanceId, cur);
      }

      const [activePlayers, survivingMarket, activeInjuries, activeSuspensions] = await Promise.all(
        [
          tx.playerInstance.findMany({
            where: { leagueId: params.leagueId, isRetired: false },
            include: { templatePlayer: { select: { basePriceMillions: true } } },
          }),
          tx.marketHistory.findMany({
            where: { leagueId: params.leagueId },
            orderBy: { recordedAt: 'desc' },
          }),
          tx.injury.findMany({ where: { leagueId: params.leagueId, active: true } }),
          tx.suspension.findMany({ where: { leagueId: params.leagueId, active: true } }),
        ],
      );
      const latestMarketByPlayer = new Map<string, (typeof survivingMarket)[number]>();
      for (const mh of survivingMarket) {
        if (!latestMarketByPlayer.has(mh.playerInstanceId)) {
          latestMarketByPlayer.set(mh.playerInstanceId, mh);
        }
      }
      const injuryByPlayer = new Map(activeInjuries.map((i) => [i.playerInstanceId, i]));
      const suspByPlayer = new Map(activeSuspensions.map((s) => [s.playerInstanceId, s]));

      for (const player of activePlayers) {
        const agg = statsAggByPlayer.get(player.id);
        const mh = latestMarketByPlayer.get(player.id);
        const inj = injuryByPlayer.get(player.id);
        const susp = suspByPlayer.get(player.id);

        const status = inj ? 'INJURED' : susp ? 'SUSPENDED' : 'HEALTHY';
        const gamesOutRemaining = inj ? inj.gamesRemaining : susp ? susp.gamesRemaining : 0;
        const statusNote = inj ? inj.reason : susp ? susp.reason : null;

        await tx.playerInstance.update({
          where: { id: player.id },
          data: {
            seasonGamesPlayed: agg?.gp ?? 0,
            seasonFantasyPoints: agg ? Number(agg.fp.toFixed(1)) : 0,
            seasonPtsAvg: agg && agg.gp > 0 ? Number((agg.pts / agg.gp).toFixed(1)) : 0,
            seasonRebAvg: agg && agg.gp > 0 ? Number((agg.reb / agg.gp).toFixed(1)) : 0,
            seasonAstAvg: agg && agg.gp > 0 ? Number((agg.ast / agg.gp).toFixed(1)) : 0,
            priceMillions: mh
              ? mh.priceMillions
              : (player.templatePlayer?.basePriceMillions ?? player.priceMillions),
            priceDeltaMillions: mh ? mh.deltaMillions : 0,
            status,
            gamesOutRemaining,
            statusNote,
          },
        });
      }

      const [teams, survivingScores] = await Promise.all([
        tx.leagueTeam.findMany({ where: { leagueId: params.leagueId }, orderBy: { code: 'asc' } }),
        tx.fantasyScore.findMany({
          where: { leagueId: params.leagueId, seasonId: targetSeason.id },
          orderBy: { roundNumber: 'desc' },
        }),
      ]);

      const fpSumByTeam = new Map<string, number>();
      const lastFpByTeam = new Map<string, number>();
      const roundsByTeam = new Map<string, number>();
      for (const score of survivingScores) {
        fpSumByTeam.set(
          score.leagueTeamId,
          (fpSumByTeam.get(score.leagueTeamId) ?? 0) + score.totalFp,
        );
        if (!lastFpByTeam.has(score.leagueTeamId)) {
          lastFpByTeam.set(score.leagueTeamId, score.totalFp);
        }
        roundsByTeam.set(score.leagueTeamId, (roundsByTeam.get(score.leagueTeamId) ?? 0) + 1);
      }

      const winsByTeam = new Map<string, number>();
      const lossesByTeam = new Map<string, number>();
      const resultsByTeam = new Map<string, ('W' | 'L')[]>();
      for (const m of refreshedMatches) {
        if (m.status !== 'FINAL' || m.homeScore === null || m.awayScore === null) {
          continue;
        }
        const homeWon = m.homeScore > m.awayScore;
        winsByTeam.set(m.homeTeamId, (winsByTeam.get(m.homeTeamId) ?? 0) + (homeWon ? 1 : 0));
        lossesByTeam.set(m.homeTeamId, (lossesByTeam.get(m.homeTeamId) ?? 0) + (homeWon ? 0 : 1));
        winsByTeam.set(m.awayTeamId, (winsByTeam.get(m.awayTeamId) ?? 0) + (homeWon ? 0 : 1));
        lossesByTeam.set(m.awayTeamId, (lossesByTeam.get(m.awayTeamId) ?? 0) + (homeWon ? 1 : 0));
        const homeHist = resultsByTeam.get(m.homeTeamId) ?? [];
        homeHist.push(homeWon ? 'W' : 'L');
        resultsByTeam.set(m.homeTeamId, homeHist.slice(-5));
        const awayHist = resultsByTeam.get(m.awayTeamId) ?? [];
        awayHist.push(homeWon ? 'L' : 'W');
        resultsByTeam.set(m.awayTeamId, awayHist.slice(-5));
      }

      const ranked = teams
        .map((team) => {
          const totalFp = Math.round((fpSumByTeam.get(team.id) ?? 0) * 10) / 10;
          const lastRoundFp = Math.round((lastFpByTeam.get(team.id) ?? 0) * 10) / 10;
          const roundsCount = roundsByTeam.get(team.id) ?? 0;
          const avgFp = roundsCount > 0 ? Math.round((totalFp / roundsCount) * 10) / 10 : 0;
          const wins = winsByTeam.get(team.id) ?? 0;
          const losses = lossesByTeam.get(team.id) ?? 0;
          const lastFive = resultsByTeam.get(team.id) ?? [];
          return { team, totalFp, lastRoundFp, avgFp, wins, losses, lastFive };
        })
        .sort((a, b) => {
          if (b.totalFp !== a.totalFp) return b.totalFp - a.totalFp;
          if (b.wins !== a.wins) return b.wins - a.wins;
          return a.team.code.localeCompare(b.team.code);
        });

      for (let i = 0; i < ranked.length; i += 1) {
        const entry = ranked[i];
        if (!entry) {
          continue;
        }
        const rank = i + 1;
        await tx.standing.upsert({
          where: {
            leagueId_seasonId_leagueTeamId: {
              leagueId: params.leagueId,
              seasonId: targetSeason.id,
              leagueTeamId: entry.team.id,
            },
          },
          update: {
            rank,
            fantasyPoints: entry.totalFp,
            lastRoundFp: entry.lastRoundFp,
            avgFp: entry.avgFp,
            wins: entry.wins,
            losses: entry.losses,
            lastFiveResults: [...entry.lastFive],
          },
          create: {
            leagueId: params.leagueId,
            seasonId: targetSeason.id,
            leagueTeamId: entry.team.id,
            rank,
            fantasyPoints: entry.totalFp,
            lastRoundFp: entry.lastRoundFp,
            avgFp: entry.avgFp,
            wins: entry.wins,
            losses: entry.losses,
            lastFiveResults: [...entry.lastFive],
          },
        });
        await tx.leagueTeam.update({
          where: { id: entry.team.id },
          data: {
            totalFantasyPoints: entry.totalFp,
            wins: entry.wins,
            losses: entry.losses,
            rank,
          },
        });
      }

      await tx.season.update({
        where: { id: targetSeason.id },
        data: { currentRoundNumber: highestCompletedRound },
      });

      await tx.transferOffer.updateMany({
        where: { leagueId: params.leagueId, rejectedGameClockAt: { gt: now } },
        data: { rejectedGameClockAt: now },
      });

      await tx.simulationJob.deleteMany({
        where: {
          leagueId: params.leagueId,
          OR: [{ startedAt: { gt: now } }, { status: { in: ['QUEUED', 'RUNNING'] } }],
        },
      });

      await tx.league.update({
        where: { id: params.leagueId },
        data: {
          gameClockAt: now,
          isAccelerated: false,
        },
      });

      return {
        previousGameClockAt,
        newGameClockAt: now.toISOString(),
        activeSeasonNumber: targetSeason.seasonNumber,
        activeSeasonName,
        currentRoundNumber: highestCompletedRound,
        deletedFutureSeasonsCount: futureSeasons.length,
        revertedMatchesCount: revertedMatchIds.length,
      };
    },
    { timeout: 60_000, maxWait: 15_000 },
  );
}
