import { randomUUID } from 'node:crypto';
import {
  formatCleanDecimal,
  LEAGUE_RULES,
  parseLeagueScoringWeights,
  type Position,
  PROVISIONAL_GAME_CONFIG,
  type SeasonResetConfig,
} from '@dream5/shared';
import {
  calculatePlayerDreamPointsBreakdown,
  createSeededRng,
  distributeMatchSlotsAcrossMonth,
  evaluatePlayerProgression,
  generateDoubleRoundRobinFixtures,
  generateReplacementRookieBlueprint,
  getDaysInCalendarMonth,
  recalculateMarketPrices,
  resolveZonedDateIso,
  simulateBasketballMatch,
} from '@dream5/simulation-engine';

import { Prisma, type PrismaClient } from '../generated/prisma/client.js';
import {
  formatSpanishSeasonName,
  pickDefaultLineupForTeam,
  resolveLeagueTimeZone,
} from './league-bootstrap.js';
import {
  buildMatchResultMailInput,
  buildRetirementReplacementMailInput,
  type CreateLeagueMailInput,
  recordHumanTeamMailsInTx,
} from './league-mail.js';
import { runAutonomousCpuTransfersInTx } from './transfer-engine.js';

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

  const scoringWeights = parseLeagueScoringWeights(match.league.scoringConfigJson);
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
      td: box.td,
      tov: box.tov,
      pf: box.pf,
      tf: box.tf,
      ft1: box.ft1,
      ft2: box.ft2,
      fantasyPoints: box.fantasyPoints,
      wasStarter: box.wasStarter,
      ejected: box.ejected,
      disqualificationReason: box.disqualificationReason,
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
    } else if (box.nextStatus === 'SUSPENDED' && box.nextGamesOut > 0) {
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
      if (box.disqualified && box.disqualificationReason) {
        const opponent =
          existing.currentTeamId === match.homeTeamId ? match.awayTeam : match.homeTeam;
        matchMails.push({
          leagueId: params.leagueId,
          seasonId: match.seasonId,
          leagueTeamId: existing.currentTeamId,
          roundNumber: match.roundNumber,
          category: 'EJECTION',
          subject: `Match Disqualification (R${String(match.roundNumber)}): ${existing.name}`,
          body: `${existing.name} (${existing.position}) was disqualified from the match against ${opponent.name} (${box.disqualificationReason}) and stopped accumulating stats. Available for the next match.`,
          metadata: {
            playerId: existing.id,
            playerName: existing.name,
            playerPosition: existing.position,
            gamesOut: 0,
            reason: box.disqualificationReason,
            opponentTeamName: opponent.name,
          },
        });
      }
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

  // Recompensa económica por victoria en la jornada: Dream Points de la jornada x 100.000
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

export interface SimulateMatchProgressResult {
  readonly alreadyCompleted: boolean;
  readonly matchId: string;
  readonly seasonId: string;
  readonly roundNumber: number;
  readonly homeScore: number;
  readonly awayScore: number;
  readonly roundCompleted: boolean;
  readonly seasonCompleted: boolean;
}

/**
 * Adquiere un bloqueo transaccional exclusivo por liga en PostgreSQL para evitar
 * conflictos de escritura o interbloqueos entre worker, API y recálculos horarios.
 */
export async function acquireLeagueAdvisoryLockInTx(
  tx: Prisma.TransactionClient,
  leagueId: string,
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${leagueId}))`;
}

async function withLeagueTxLock<T>(
  prisma: PrismaClient,
  leagueId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  options: { readonly timeout?: number; readonly maxWait?: number } = {},
): Promise<T> {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          await acquireLeagueAdvisoryLockInTx(tx, leagueId);
          return fn(tx);
        },
        {
          timeout: options.timeout ?? 60_000,
          maxWait: options.maxWait ?? 15_000,
        },
      );
    } catch (error: unknown) {
      const isWriteConflict =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
      if (!isWriteConflict || attempt === maxAttempts) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, attempt * 120));
    }
  }
  throw new Error('No se pudo completar la transacción tras varios reintentos.');
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

async function finalizeRoundCompletionInTx(
  tx: Prisma.TransactionClient,
  params: {
    readonly leagueId: string;
    readonly season: {
      readonly id: string;
      readonly totalRounds: number;
      readonly currentRoundNumber: number;
      readonly playersAged: boolean;
    };
    readonly roundNumber: number;
    readonly latestClockAt?: Date;
    readonly runPostRoundEconomy: boolean;
  },
): Promise<{ readonly seasonCompleted: boolean }> {
  const { leagueId, season, roundNumber, latestClockAt, runPostRoundEconomy } = params;

  await recalculateRoundStandingsInTx(tx, {
    leagueId,
    seasonId: season.id,
    roundNumber,
  });

  const nextRoundNumber = Math.max(season.currentRoundNumber, roundNumber);
  await tx.season.update({
    where: { id: season.id },
    data: { currentRoundNumber: nextRoundNumber },
  });

  if (latestClockAt) {
    const league = await tx.league.findUnique({ where: { id: leagueId } });
    if (league && latestClockAt > league.gameClockAt) {
      await tx.league.update({
        where: { id: league.id },
        data: { gameClockAt: latestClockAt },
      });
    }
  }

  // Bloqueamos la alineación de la jornada simulada y copiamos titulares a round+1
  await tx.lineup.updateMany({
    where: {
      leagueId,
      seasonId: season.id,
      roundNumber,
    },
    data: { isLocked: true },
  });

  if (roundNumber < season.totalRounds) {
    const nextRound = roundNumber + 1;
    const currentLineups = await tx.lineup.findMany({
      where: {
        leagueId,
        seasonId: season.id,
        roundNumber,
      },
    });
    for (const l of currentLineups) {
      const existsNext = await tx.lineup.findUnique({
        where: {
          leagueId_seasonId_leagueTeamId_roundNumber: {
            leagueId,
            seasonId: season.id,
            leagueTeamId: l.leagueTeamId,
            roundNumber: nextRound,
          },
        },
      });
      if (!existsNext) {
        await tx.lineup.create({
          data: {
            leagueId,
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

  if (runPostRoundEconomy) {
    await repriceLeagueMarketInTx(tx, {
      leagueId,
      reason: `Post-jornada ${String(roundNumber)}`,
    });
    await runAutonomousCpuTransfersInTx(tx, {
      leagueId,
      seasonId: season.id,
      roundNumber,
    });
  }

  let seasonCompleted = false;
  if (nextRoundNumber >= season.totalRounds) {
    const remainingScheduled = await tx.match.count({
      where: {
        leagueId,
        seasonId: season.id,
        status: 'SCHEDULED',
      },
    });
    if (remainingScheduled === 0) {
      seasonCompleted = true;
      await ageActivePlayersIfNeededInTx(tx, {
        leagueId,
        seasonId: season.id,
        alreadyAged: season.playersAged,
      });
    }
  }

  return { seasonCompleted };
}

/**
 * Simula un partido concreto dentro de una transacción con bloqueo por liga;
 * actualiza clasificación al instante y, si era el último partido de la jornada,
 * ejecuta el cierre completo de jornada (lineups, mercado, CPU y fin de temporada).
 */
export async function simulateScheduledMatchAndProgress(
  prisma: PrismaClient,
  params: {
    readonly leagueId: string;
    readonly matchId: string;
    readonly simulatedAt?: Date;
  },
): Promise<SimulateMatchProgressResult> {
  return withLeagueTxLock(prisma, params.leagueId, async (tx) => {
    const simRes = await simulateSingleMatchInTx(tx, params);
    if (simRes.alreadyCompleted) {
      return {
        ...simRes,
        roundCompleted: false,
        seasonCompleted: false,
      };
    }

    const remainingInRound = await tx.match.count({
      where: {
        leagueId: params.leagueId,
        seasonId: simRes.seasonId,
        roundNumber: simRes.roundNumber,
        status: 'SCHEDULED',
      },
    });

    if (remainingInRound > 0) {
      await recalculateRoundStandingsInTx(tx, {
        leagueId: params.leagueId,
        seasonId: simRes.seasonId,
        roundNumber: simRes.roundNumber,
      });
      return {
        ...simRes,
        roundCompleted: false,
        seasonCompleted: false,
      };
    }

    const season = await tx.season.findUnique({ where: { id: simRes.seasonId } });
    if (!season) {
      throw new Error(`Temporada ${simRes.seasonId} no encontrada tras simular partido.`);
    }

    const latestRoundMatch = await tx.match.findFirst({
      where: {
        leagueId: params.leagueId,
        seasonId: season.id,
        roundNumber: simRes.roundNumber,
      },
      orderBy: { scheduledAt: 'desc' },
      select: { scheduledAt: true },
    });

    const completion = await finalizeRoundCompletionInTx(tx, {
      leagueId: params.leagueId,
      season,
      roundNumber: simRes.roundNumber,
      ...(latestRoundMatch?.scheduledAt ? { latestClockAt: latestRoundMatch.scheduledAt } : {}),
      runPostRoundEconomy: true,
    });

    return {
      ...simRes,
      roundCompleted: true,
      seasonCompleted: completion.seasonCompleted,
    };
  });
}

/**
 * Caduca automáticamente ofertas de traspaso pendientes cuya fecha límite haya vencido.
 */
export async function expirePendingTransferOffers(
  prisma: PrismaClient,
  params: { readonly leagueId: string; readonly asOf?: Date },
): Promise<{ readonly expiredCount: number }> {
  const cutoff = params.asOf ?? new Date();
  return withLeagueTxLock(
    prisma,
    params.leagueId,
    async (tx) => {
      const updated = await tx.transferOffer.updateMany({
        where: {
          leagueId: params.leagueId,
          status: 'PENDING',
          expiresAt: { lte: cutoff },
        },
        data: {
          status: 'EXPIRED',
          respondedAt: cutoff,
          responseNote: 'Offer expired automatically after deadline.',
        },
      });
      return { expiredCount: updated.count };
    },
    { timeout: 15_000, maxWait: 5_000 },
  );
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
  return withLeagueTxLock(prisma, params.leagueId, async (tx) => {
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

    const completion = await finalizeRoundCompletionInTx(tx, {
      leagueId: params.leagueId,
      season,
      roundNumber: params.roundNumber,
      latestClockAt: latestMatchAt,
      runPostRoundEconomy: matchesSimulated > 0,
    });

    return {
      leagueId: params.leagueId,
      seasonId: season.id,
      roundNumber: params.roundNumber,
      matchesSimulated,
      seasonCompleted: completion.seasonCompleted,
    };
  });
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
          : Math.max(2, Math.pow(Math.max(1.5, p.priceMillions) / 7.14, 1 / 1.72) * 10),
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
  return withLeagueTxLock(prisma, params.leagueId, (tx) => repriceLeagueMarketInTx(tx, params), {
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
    readonly expectedSeasonId?: string;
  },
): Promise<{
  readonly previousSeasonId: string;
  readonly newSeasonId: string;
  readonly newSeasonNumber: number;
  readonly alreadyAdvanced?: boolean;
}> {
  const config = params.resetConfig ?? PROVISIONAL_GAME_CONFIG.seasonReset;

  return withLeagueTxLock(
    prisma,
    params.leagueId,
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

      if (params.expectedSeasonId && currentSeason.id !== params.expectedSeasonId) {
        return {
          previousSeasonId: params.expectedSeasonId,
          newSeasonId: currentSeason.id,
          newSeasonNumber: currentSeason.seasonNumber,
          alreadyAdvanced: true,
        };
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
      const timeZone = resolveLeagueTimeZone();
      const newClock = new Date(
        resolveZonedDateIso({
          year: nextYear,
          month: nextMonth,
          dayOfMonth: 1,
          hour: 7,
          minute: 30,
          timeZone,
        }),
      );

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
            ? `#${String(prev.rank)} (${String(prev.wins)}-${String(prev.losses)}, ${formatCleanDecimal(prev.fantasyPoints)} DP)`
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
        timeZone,
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
  readonly clearedTransferLocksCount: number;
}

export async function applyEquitativeScheduleToSeasonMatchesInTx(
  tx: Prisma.TransactionClient,
  params: {
    readonly leagueId: string;
    readonly seasonId: string;
    readonly calendarYear: number;
    readonly calendarMonth: number;
    readonly timeZone: string;
    readonly preserveStartedRounds: boolean;
    readonly onlyFutureRoundsAfter?: Date;
  },
): Promise<number> {
  const slots = distributeMatchSlotsAcrossMonth({
    year: params.calendarYear,
    month: params.calendarMonth,
    startHour: LEAGUE_RULES.dailyWindowStartHour,
    endHour: LEAGUE_RULES.dailyWindowEndHour,
    matchesPerRound: LEAGUE_RULES.matchesPerRound,
    timeZone: params.timeZone,
  });
  const slotDateByKey = new Map<string, Date>(
    slots.map((s) => [
      `${String(s.roundNumber)}:${String(s.matchIndexInRound)}`,
      new Date(s.scheduledAtIso),
    ]),
  );

  const seasonMatches = await tx.match.findMany({
    where: { leagueId: params.leagueId, seasonId: params.seasonId },
    orderBy: [{ roundNumber: 'asc' }, { scheduledAt: 'asc' }, { id: 'asc' }],
  });

  const matchesByRound = new Map<number, (typeof seasonMatches)[number][]>();
  for (const m of seasonMatches) {
    const list = matchesByRound.get(m.roundNumber) ?? [];
    list.push(m);
    matchesByRound.set(m.roundNumber, list);
  }

  let updatedCount = 0;
  const cutoff = params.onlyFutureRoundsAfter;
  for (const [roundNumber, roundMatches] of matchesByRound.entries()) {
    if (params.preserveStartedRounds && roundMatches.some((m) => m.status !== 'SCHEDULED')) {
      continue;
    }
    const firstSlotDate = slotDateByKey.get(`${String(roundNumber)}:0`);
    if (
      cutoff &&
      (roundMatches.some((m) => m.scheduledAt <= cutoff) ||
        (firstSlotDate !== undefined && firstSlotDate <= cutoff))
    ) {
      continue;
    }

    for (let idx = 0; idx < roundMatches.length; idx += 1) {
      const m = roundMatches[idx];
      const targetDate = slotDateByKey.get(`${String(roundNumber)}:${String(idx)}`);
      if (!m || !targetDate) {
        continue;
      }
      if (Math.abs(m.scheduledAt.getTime() - targetDate.getTime()) > 1_000) {
        await tx.match.update({
          where: { id: m.id },
          data: { scheduledAt: targetDate },
        });
        updatedCount += 1;
      }
    }
  }

  return updatedCount;
}

/**
 * Reprograma de forma idempotente los partidos futuros no iniciados de todas las temporadas activas
 * para repartir equitativamente sus horarios entre 08:00 y 20:00 (hora del servidor).
 */
export async function rescheduleUpcomingLeagueMatches(
  prisma: PrismaClient,
  params: { readonly leagueId?: string; readonly asOf?: Date } = {},
): Promise<{ readonly updatedMatchesCount: number }> {
  const timeZone = resolveLeagueTimeZone();
  const asOf = params.asOf ?? new Date();
  const activeLeagues = await prisma.league.findMany({
    where: {
      status: 'ACTIVE',
      ...(params.leagueId ? { id: params.leagueId } : {}),
    },
    include: {
      seasons: {
        where: { status: 'ACTIVE' },
        orderBy: { seasonNumber: 'desc' },
        take: 1,
      },
    },
  });

  let updatedMatchesCount = 0;
  for (const league of activeLeagues) {
    const activeSeason = league.seasons[0];
    if (!activeSeason) {
      continue;
    }
    updatedMatchesCount += await withLeagueTxLock(prisma, league.id, (tx) =>
      applyEquitativeScheduleToSeasonMatchesInTx(tx, {
        leagueId: league.id,
        seasonId: activeSeason.id,
        calendarYear: activeSeason.calendarYear,
        calendarMonth: activeSeason.calendarMonth,
        timeZone,
        preserveStartedRounds: true,
        onlyFutureRoundsAfter: asOf,
      }),
    );
  }

  return { updatedMatchesCount };
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
  const timeZone = resolveLeagueTimeZone();
  const nowYear = now.getFullYear();
  const nowMonth = now.getMonth() + 1;
  const nowMonthStart = new Date(
    resolveZonedDateIso({
      year: nowYear,
      month: nowMonth,
      dayOfMonth: 1,
      hour: 7,
      minute: 30,
      timeZone,
    }),
  );

  return withLeagueTxLock(
    prisma,
    params.leagueId,
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

        await applyEquitativeScheduleToSeasonMatchesInTx(tx, {
          leagueId: params.leagueId,
          seasonId: targetSeason.id,
          calendarYear: nowYear,
          calendarMonth: nowMonth,
          timeZone,
          preserveStartedRounds: false,
        });
      } else {
        await tx.season.update({
          where: { id: targetSeason.id },
          data: {
            status: 'ACTIVE',
            endedAt: null,
            playersAged: false,
          },
        });
        await applyEquitativeScheduleToSeasonMatchesInTx(tx, {
          leagueId: params.leagueId,
          seasonId: targetSeason.id,
          calendarYear: targetSeason.calendarYear,
          calendarMonth: targetSeason.calendarMonth,
          timeZone,
          preserveStartedRounds: true,
          onlyFutureRoundsAfter: now,
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

      const clearedLocks = await cleanupInvalidTransferLocksInTx(tx, params.leagueId);

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
        clearedTransferLocksCount:
          clearedLocks.clearedPlayerLocksCount + clearedLocks.clearedRejectedCooldownsCount,
      };
    },
    { timeout: 60_000, maxWait: 15_000 },
  );
}

function hasNbaScoringConfigJson(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return false;
  }
  const obj = raw as Record<string, unknown>;
  return typeof obj['ptsDivisor'] === 'number' && Number.isFinite(obj['ptsDivisor']);
}

/**
 * Elimina bloqueos de traspaso incoherentes o caducados (por ejemplo, tras revertir
 * temporadas o jornadas futuras mediante sincronización del reloj).
 */
export async function cleanupInvalidTransferLocksInTx(
  tx: Prisma.TransactionClient,
  leagueId: string,
): Promise<{
  readonly clearedPlayerLocksCount: number;
  readonly clearedRejectedCooldownsCount: number;
}> {
  const acquiredLockMatches = PROVISIONAL_GAME_CONFIG.transfers.acquiredPlayerLockMatches;
  const rejectionCooldownMatches = PROVISIONAL_GAME_CONFIG.transfers.rejectionCooldownMatches;

  const [finalMatches, lockedPlayers, rejectedOffers] = await Promise.all([
    tx.match.findMany({
      where: { leagueId, status: 'FINAL' },
      select: { homeTeamId: true, awayTeamId: true },
    }),
    tx.playerInstance.findMany({
      where: { leagueId, tradeLockUntilTeamMatches: { not: null } },
      select: {
        id: true,
        currentTeamId: true,
        tradeLockTeamId: true,
        tradeLockUntilTeamMatches: true,
        isRetired: true,
      },
    }),
    tx.transferOffer.findMany({
      where: {
        leagueId,
        status: 'REJECTED',
        rejectedAtTeamMatches: { not: null },
      },
      select: {
        id: true,
        proposingTeamId: true,
        rejectedAtTeamMatches: true,
      },
    }),
  ]);

  const completedByTeam = new Map<string, number>();
  for (const m of finalMatches) {
    completedByTeam.set(m.homeTeamId, (completedByTeam.get(m.homeTeamId) ?? 0) + 1);
    completedByTeam.set(m.awayTeamId, (completedByTeam.get(m.awayTeamId) ?? 0) + 1);
  }

  const playerIdsToUnlock: string[] = [];
  for (const p of lockedPlayers) {
    if (p.tradeLockUntilTeamMatches === null) {
      continue;
    }
    const ownerMatches = completedByTeam.get(p.currentTeamId) ?? 0;
    const invalidOwner = p.isRetired || !p.tradeLockTeamId || p.tradeLockTeamId !== p.currentTeamId;
    const remaining = p.tradeLockUntilTeamMatches - ownerMatches;
    if (invalidOwner || remaining <= 0 || remaining > acquiredLockMatches) {
      playerIdsToUnlock.push(p.id);
    }
  }

  if (playerIdsToUnlock.length > 0) {
    await tx.playerInstance.updateMany({
      where: { leagueId, id: { in: playerIdsToUnlock } },
      data: { tradeLockTeamId: null, tradeLockUntilTeamMatches: null },
    });
  }

  const offerIdsToClear: string[] = [];
  for (const rej of rejectedOffers) {
    if (rej.rejectedAtTeamMatches === null) {
      continue;
    }
    const teamMatches = completedByTeam.get(rej.proposingTeamId) ?? 0;
    const staleFromFutureRevert = rej.rejectedAtTeamMatches > teamMatches;
    const expired = rej.rejectedAtTeamMatches + rejectionCooldownMatches <= teamMatches;
    if (staleFromFutureRevert || expired) {
      offerIdsToClear.push(rej.id);
    }
  }

  if (offerIdsToClear.length > 0) {
    await tx.transferOffer.updateMany({
      where: { leagueId, id: { in: offerIdsToClear } },
      data: { rejectedAtTeamMatches: null },
    });
  }

  return {
    clearedPlayerLocksCount: playerIdsToUnlock.length,
    clearedRejectedCooldownsCount: offerIdsToClear.length,
  };
}

export interface UpgradeExistingLeaguesResult {
  readonly processedLeaguesCount: number;
  readonly recalculatedStatsCount: number;
  readonly scaledMarketLeaguesCount: number;
  readonly unlockedPlayersCount: number;
  readonly clearedRejectedCooldownsCount: number;
}

/**
 * Actualiza de forma idempotente todas las ligas existentes para:
 * 1) Desbloquear jugadores/ofertas con bloqueos incoherentes tras cambios de calendario;
 * 2) Migrar ligas heredadas a las reglas NBA oficiales y recalcular Dream Points ya jugados;
 * 3) Escalar el mercado existente x3 (precios, deltas, historial, presupuestos base y
 *    premios x100.000) una única vez por liga (`marketScale < 3`).
 */
export async function recalculateAndUpgradeExistingLeagues(
  prisma: PrismaClient,
  options: { readonly leagueId?: string; readonly forceRecalculateScores?: boolean } = {},
): Promise<UpgradeExistingLeaguesResult> {
  const leagues = await prisma.league.findMany({
    ...(options.leagueId ? { where: { id: options.leagueId } } : {}),
    select: { id: true },
  });

  let processedLeaguesCount = 0;
  let recalculatedStatsCount = 0;
  let scaledMarketLeaguesCount = 0;
  let unlockedPlayersCount = 0;
  let clearedRejectedCooldownsCount = 0;

  for (const { id: leagueId } of leagues) {
    await withLeagueTxLock(
      prisma,
      leagueId,
      async (tx) => {
        const league = await tx.league.findUnique({ where: { id: leagueId } });
        if (!league) {
          return;
        }
        processedLeaguesCount += 1;

        const lockClean = await cleanupInvalidTransferLocksInTx(tx, leagueId);
        unlockedPlayersCount += lockClean.clearedPlayerLocksCount;
        clearedRejectedCooldownsCount += lockClean.clearedRejectedCooldownsCount;

        const needsScoringUpgrade =
          Boolean(options.forceRecalculateScores) ||
          !hasNbaScoringConfigJson(league.scoringConfigJson) ||
          league.marketScale < 3;
        const needsMarketScaleX3 = league.marketScale < 3;

        if (!needsScoringUpgrade && !needsMarketScaleX3) {
          return;
        }

        const weights = PROVISIONAL_GAME_CONFIG.scoringWeights;
        if (!hasNbaScoringConfigJson(league.scoringConfigJson)) {
          await tx.league.update({
            where: { id: leagueId },
            data: { scoringConfigJson: weights },
          });
        }

        const [seasons, teams, allPlayers, lineups, finalMatches, stats] = await Promise.all([
          tx.season.findMany({ where: { leagueId }, orderBy: { seasonNumber: 'asc' } }),
          tx.leagueTeam.findMany({ where: { leagueId }, orderBy: { code: 'asc' } }),
          tx.playerInstance.findMany({ where: { leagueId, isRetired: false } }),
          tx.lineup.findMany({
            where: { leagueId },
            orderBy: [{ seasonId: 'asc' }, { roundNumber: 'desc' }],
          }),
          tx.match.findMany({
            where: { leagueId, status: 'FINAL' },
            orderBy: [{ seasonId: 'asc' }, { roundNumber: 'asc' }],
          }),
          tx.playerMatchStat.findMany({ where: { leagueId } }),
        ]);

        // 1) Recalcular td y fantasyPoints en cada PlayerMatchStat con la regla NBA actual
        const statUpdateIds: string[] = [];
        const statUpdateTds: number[] = [];
        const statUpdateFps: number[] = [];
        const updatedFpByStatId = new Map<string, number>();

        for (const stat of stats) {
          const breakdown = calculatePlayerDreamPointsBreakdown(
            {
              pts: stat.pts,
              reb: stat.reb,
              ast: stat.ast,
              stl: stat.stl,
              blk: stat.blk,
              tov: stat.tov,
              pf: stat.pf,
              tf: stat.tf,
              ft1: stat.ft1,
              ft2: stat.ft2,
              minutes: stat.minutes,
            },
            weights,
          );
          updatedFpByStatId.set(stat.id, breakdown.total);
          if (
            stat.td !== breakdown.tdCount ||
            Math.abs(stat.fantasyPoints - breakdown.total) > 0.001
          ) {
            statUpdateIds.push(stat.id);
            statUpdateTds.push(breakdown.tdCount);
            statUpdateFps.push(breakdown.total);
          }
        }

        if (statUpdateIds.length > 0) {
          const chunkSize = 2000;
          for (let offset = 0; offset < statUpdateIds.length; offset += chunkSize) {
            const idsSlice = statUpdateIds.slice(offset, offset + chunkSize);
            const tdsSlice = statUpdateTds.slice(offset, offset + chunkSize);
            const fpsSlice = statUpdateFps.slice(offset, offset + chunkSize);
            await tx.$executeRaw`
              UPDATE "player_match_stats" AS pms
              SET "td" = v.td, "fantasy_points" = v.fp
              FROM unnest(
                ${idsSlice}::text[],
                ${tdsSlice}::integer[],
                ${fpsSlice}::double precision[]
              ) AS v(id, td, fp)
              WHERE pms."id" = v.id
            `;
          }
          recalculatedStatsCount += statUpdateIds.length;
        }

        const playerNameById = new Map(allPlayers.map((p) => [p.id, p.name]));
        const rosterByTeam = new Map<string, (typeof allPlayers)[number][]>();
        for (const p of allPlayers) {
          const arr = rosterByTeam.get(p.currentTeamId) ?? [];
          arr.push(p);
          rosterByTeam.set(p.currentTeamId, arr);
        }

        const lineupsBySeason = new Map<string, (typeof lineups)[number][]>();
        for (const l of lineups) {
          const arr = lineupsBySeason.get(l.seasonId) ?? [];
          arr.push(l);
          lineupsBySeason.set(l.seasonId, arr);
        }

        const statsBySeasonRoundPlayer = new Map<string, (typeof stats)[number]>();
        const playedRoundsBySeason = new Map<string, Set<number>>();
        for (const s of stats) {
          statsBySeasonRoundPlayer.set(
            `${s.seasonId}:${String(s.roundNumber)}:${s.playerInstanceId}`,
            s,
          );
          const set = playedRoundsBySeason.get(s.seasonId) ?? new Set<number>();
          set.add(s.roundNumber);
          playedRoundsBySeason.set(s.seasonId, set);
        }

        // También aseguramos FantasyScore por cada jornada con partidos FINAL
        for (const m of finalMatches) {
          const set = playedRoundsBySeason.get(m.seasonId) ?? new Set<number>();
          set.add(m.roundNumber);
          playedRoundsBySeason.set(m.seasonId, set);
        }

        const roundFpBySeasonRoundTeam = new Map<string, number>();
        const slotPositions: readonly Position[] = ['PG', 'SG', 'SF', 'PF', 'C'];
        const activeSeason = seasons[seasons.length - 1];

        for (const season of seasons) {
          const rounds = [...(playedRoundsBySeason.get(season.id) ?? new Set<number>())].sort(
            (a, b) => a - b,
          );
          const seasonLineups = lineupsBySeason.get(season.id) ?? [];

          for (const roundNumber of rounds) {
            const effectiveLineupByTeam = new Map<string, (typeof seasonLineups)[number]>();
            for (const l of seasonLineups) {
              if (l.roundNumber <= roundNumber && !effectiveLineupByTeam.has(l.leagueTeamId)) {
                effectiveLineupByTeam.set(l.leagueTeamId, l);
              }
            }

            for (const team of teams) {
              const saved = effectiveLineupByTeam.get(team.id);
              const roster = rosterByTeam.get(team.id) ?? [];
              let starterIds: Record<Position, string | null>;
              if (saved) {
                starterIds = {
                  PG: saved.pgPlayerId,
                  SG: saved.sgPlayerId,
                  SF: saved.sfPlayerId,
                  PF: saved.pfPlayerId,
                  C: saved.cPlayerId,
                };
              } else if (roster.length >= 5) {
                const picked = pickDefaultLineupForTeam(
                  roster.map((p) => ({
                    id: p.id,
                    position: p.position,
                    overallRating: p.overallRating,
                    status: p.status,
                  })),
                );
                starterIds = {
                  PG: picked.pgPlayerId,
                  SG: picked.sgPlayerId,
                  SF: picked.sfPlayerId,
                  PF: picked.pfPlayerId,
                  C: picked.cPlayerId,
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
                const pid = starterIds[pos];
                const stat = pid
                  ? statsBySeasonRoundPlayer.get(`${season.id}:${String(roundNumber)}:${pid}`)
                  : undefined;
                const fp = stat ? (updatedFpByStatId.get(stat.id) ?? stat.fantasyPoints) : 0;
                teamRoundFp += fp;
                breakdown[pos] = {
                  playerId: pid,
                  playerName: pid ? (playerNameById.get(pid) ?? null) : null,
                  fp: Math.round(fp * 10) / 10,
                };
              }

              teamRoundFp = Math.round(teamRoundFp * 10) / 10;
              roundFpBySeasonRoundTeam.set(
                `${season.id}:${String(roundNumber)}:${team.id}`,
                teamRoundFp,
              );

              await tx.fantasyScore.upsert({
                where: {
                  leagueId_seasonId_roundNumber_leagueTeamId: {
                    leagueId,
                    seasonId: season.id,
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
                  seasonId: season.id,
                  roundNumber,
                  leagueTeamId: team.id,
                  totalFp: teamRoundFp,
                  breakdownJson: breakdown,
                },
              });
            }
          }

          // Reagregar clasificación de esta temporada
          const seasonFinalMatches = finalMatches.filter((m) => m.seasonId === season.id);
          const winsByTeam = new Map<string, number>();
          const lossesByTeam = new Map<string, number>();
          const resultsByTeam = new Map<string, ('W' | 'L')[]>();
          for (const m of seasonFinalMatches) {
            if (m.homeScore === null || m.awayScore === null) {
              continue;
            }
            const homeWon = m.homeScore > m.awayScore;
            winsByTeam.set(m.homeTeamId, (winsByTeam.get(m.homeTeamId) ?? 0) + (homeWon ? 1 : 0));
            lossesByTeam.set(
              m.homeTeamId,
              (lossesByTeam.get(m.homeTeamId) ?? 0) + (homeWon ? 0 : 1),
            );
            winsByTeam.set(m.awayTeamId, (winsByTeam.get(m.awayTeamId) ?? 0) + (homeWon ? 0 : 1));
            lossesByTeam.set(
              m.awayTeamId,
              (lossesByTeam.get(m.awayTeamId) ?? 0) + (homeWon ? 1 : 0),
            );
            const h = resultsByTeam.get(m.homeTeamId) ?? [];
            h.push(homeWon ? 'W' : 'L');
            resultsByTeam.set(m.homeTeamId, h.slice(-5));
            const a = resultsByTeam.get(m.awayTeamId) ?? [];
            a.push(homeWon ? 'L' : 'W');
            resultsByTeam.set(m.awayTeamId, a.slice(-5));
          }

          const rankedSeason = teams
            .map((team) => {
              let totalFp = 0;
              let lastRoundFp = 0;
              for (const r of rounds) {
                const v = roundFpBySeasonRoundTeam.get(`${season.id}:${String(r)}:${team.id}`) ?? 0;
                totalFp += v;
                lastRoundFp = v;
              }
              totalFp = Math.round(totalFp * 10) / 10;
              lastRoundFp = Math.round(lastRoundFp * 10) / 10;
              const avgFp = rounds.length > 0 ? Math.round((totalFp / rounds.length) * 10) / 10 : 0;
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

          const isCurrentActiveSeason = activeSeason?.id === season.id;
          for (let idx = 0; idx < rankedSeason.length; idx += 1) {
            const entry = rankedSeason[idx];
            if (!entry) {
              continue;
            }
            const rank = idx + 1;
            await tx.standing.upsert({
              where: {
                leagueId_seasonId_leagueTeamId: {
                  leagueId,
                  seasonId: season.id,
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
                seasonId: season.id,
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

            if (isCurrentActiveSeason) {
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
          }
        }

        // Recalcular acumulados individuales de la temporada activa
        if (activeSeason) {
          const activeStats = stats.filter((s) => s.seasonId === activeSeason.id);
          const aggByPlayer = new Map<
            string,
            { gp: number; fp: number; pts: number; reb: number; ast: number }
          >();
          for (const s of activeStats) {
            const fp = updatedFpByStatId.get(s.id) ?? s.fantasyPoints;
            const cur = aggByPlayer.get(s.playerInstanceId) ?? {
              gp: 0,
              fp: 0,
              pts: 0,
              reb: 0,
              ast: 0,
            };
            cur.gp += 1;
            cur.fp += fp;
            cur.pts += s.pts;
            cur.reb += s.reb;
            cur.ast += s.ast;
            aggByPlayer.set(s.playerInstanceId, cur);
          }
          for (const player of allPlayers) {
            const agg = aggByPlayer.get(player.id);
            await tx.playerInstance.update({
              where: { id: player.id },
              data: {
                seasonGamesPlayed: agg?.gp ?? 0,
                seasonFantasyPoints: agg ? Number(agg.fp.toFixed(1)) : 0,
                seasonPtsAvg: agg && agg.gp > 0 ? Number((agg.pts / agg.gp).toFixed(1)) : 0,
                seasonRebAvg: agg && agg.gp > 0 ? Number((agg.reb / agg.gp).toFixed(1)) : 0,
                seasonAstAvg: agg && agg.gp > 0 ? Number((agg.ast / agg.gp).toFixed(1)) : 0,
              },
            });
          }
        }

        // 2) Escalar mercado x3 y actualizar recompensas históricas a DP * 100.000 una sola vez
        if (needsMarketScaleX3) {
          const oldRewardByTeam = new Map<string, number>();
          const newRewardByTeam = new Map<string, number>();
          const matchIdsToUpdate: string[] = [];
          const matchRewardsToUpdate: number[] = [];

          for (const m of finalMatches) {
            if (m.homeScore === null || m.awayScore === null || m.homeScore === m.awayScore) {
              continue;
            }
            const winnerTeamId = m.homeScore > m.awayScore ? m.homeTeamId : m.awayTeamId;
            if (m.winRewardPaid && typeof m.winRewardMillions === 'number') {
              oldRewardByTeam.set(
                winnerTeamId,
                (oldRewardByTeam.get(winnerTeamId) ?? 0) + m.winRewardMillions,
              );
            }
            const winnerDp = Math.max(
              0,
              roundFpBySeasonRoundTeam.get(
                `${m.seasonId}:${String(m.roundNumber)}:${winnerTeamId}`,
              ) ?? 0,
            );
            const newRewardMillions =
              Math.round(
                winnerDp * PROVISIONAL_GAME_CONFIG.economyAndMarket.winRewardPerFantasyPoint,
              ) / 1_000_000;
            if (m.winRewardPaid) {
              newRewardByTeam.set(
                winnerTeamId,
                (newRewardByTeam.get(winnerTeamId) ?? 0) + newRewardMillions,
              );
              matchIdsToUpdate.push(m.id);
              matchRewardsToUpdate.push(newRewardMillions);
            }
          }

          if (matchIdsToUpdate.length > 0) {
            await tx.$executeRaw`
              UPDATE "matches" AS m
              SET "win_reward_millions" = v.reward
              FROM unnest(
                ${matchIdsToUpdate}::text[],
                ${matchRewardsToUpdate}::double precision[]
              ) AS v(id, reward)
              WHERE m."id" = v.id
            `;
          }

          for (const team of teams) {
            const oldReward = oldRewardByTeam.get(team.id) ?? 0;
            const newReward = newRewardByTeam.get(team.id) ?? 0;
            const baseAndTrades = team.budgetMillions - oldReward;
            const nextBudget = Math.max(0, Number((baseAndTrades * 3 + newReward).toFixed(2)));
            await tx.leagueTeam.update({
              where: { id: team.id },
              data: { budgetMillions: nextBudget },
            });
          }

          const minPrice = PROVISIONAL_GAME_CONFIG.economyAndMarket.minPlayerPriceMillions;
          const maxPrice = PROVISIONAL_GAME_CONFIG.economyAndMarket.maxPlayerPriceMillions;

          await tx.$executeRaw`
            UPDATE "player_instances"
            SET
              "price_millions" = LEAST(${maxPrice}, GREATEST(${minPrice}, ROUND((("price_millions" * 3.0)::numeric), 1)::double precision)),
              "price_delta_millions" = ROUND((("price_delta_millions" * 3.0)::numeric), 1)::double precision
            WHERE "league_id" = ${leagueId}
          `;

          await tx.$executeRaw`
            UPDATE "market_history"
            SET
              "price_millions" = LEAST(${maxPrice}, GREATEST(${minPrice}, ROUND((("price_millions" * 3.0)::numeric), 1)::double precision)),
              "delta_millions" = ROUND((("delta_millions" * 3.0)::numeric), 1)::double precision
            WHERE "league_id" = ${leagueId}
          `;

          const pendingOffers = await tx.transferOffer.findMany({
            where: { leagueId, status: 'PENDING' },
            select: { id: true, cashOfferedMillions: true, cashRequestedMillions: true },
          });
          for (const offer of pendingOffers) {
            if (offer.cashOfferedMillions > 0 || offer.cashRequestedMillions > 0) {
              await tx.transferOffer.update({
                where: { id: offer.id },
                data: {
                  cashOfferedMillions: Number((offer.cashOfferedMillions * 3).toFixed(1)),
                  cashRequestedMillions: Number((offer.cashRequestedMillions * 3).toFixed(1)),
                },
              });
            }
          }

          await tx.league.update({
            where: { id: leagueId },
            data: { marketScale: 3 },
          });
          scaledMarketLeaguesCount += 1;
        }
      },
      { timeout: 120_000, maxWait: 15_000 },
    );
  }

  return {
    processedLeaguesCount,
    recalculatedStatsCount,
    scaledMarketLeaguesCount,
    unlockedPlayersCount,
    clearedRejectedCooldownsCount,
  };
}
