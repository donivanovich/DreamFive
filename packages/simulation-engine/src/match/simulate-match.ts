import { evaluateInGameDiscipline } from '../injuries/index.js';
import { calculatePlayerDreamPointsBreakdown } from '../scoring/index.js';
import { createSeededRng, type DeterministicRng } from '../shared/prng.js';
import type {
  EngineInjuryConfig,
  EnginePlayerInput,
  EnginePlayerRole,
  EngineScoringWeights,
  EngineTeamInput,
  SimulatedMatchEvent,
  SimulatedPlayerBox,
  SimulateMatchOutput,
} from '../shared/types.js';
import { buildTeamTotalsFromBoxes } from '../statistics/index.js';

const ROLE_MINUTE_WEIGHT: Record<EnginePlayerRole, number> = {
  SUPERSTAR: 34,
  STAR: 31,
  STARTER: 26,
  ROTATION: 17,
  ROOKIE: 13,
  BENCH: 5,
};

function chooseRotationMinutes(params: {
  readonly roster: readonly EnginePlayerInput[];
  readonly totalTeamMinutes: number;
  readonly rng: DeterministicRng;
}): {
  readonly starterIds: ReadonlySet<string>;
  readonly minutesById: ReadonlyMap<string, number>;
} {
  const { roster, totalTeamMinutes, rng } = params;

  const eligible = roster.filter(
    (player) =>
      player.status !== 'INJURED' &&
      player.status !== 'SUSPENDED' &&
      !(player.status === 'QUESTIONABLE' && rng.nextFloat() < 0.35),
  );

  // Elegimos 5 titulares intentando cubrir posiciones, aplicando criterio flexible del entrenador
  const starterIds = new Set<string>();
  const positions = ['PG', 'SG', 'SF', 'PF', 'C'] as const;
  for (const pos of positions) {
    const candidates = eligible
      .filter((p) => p.position === pos)
      .sort(
        (a, b) =>
          ROLE_MINUTE_WEIGHT[b.role] * 0.7 +
          b.overallRating * 0.3 +
          rng.nextRange(-6, 6) -
          (ROLE_MINUTE_WEIGHT[a.role] * 0.7 + a.overallRating * 0.3),
      );
    const chosen = candidates[0];
    if (chosen) {
      starterIds.add(chosen.id);
    }
  }
  for (const p of eligible) {
    if (starterIds.size >= 5) {
      break;
    }
    starterIds.add(p.id);
  }

  // El entrenador asigna pesos de minutos influidos por rol, forma diaria y oportunidades para rookies
  const weights = new Map<string, number>();
  let totalWeight = 0;

  for (const player of roster) {
    if (!eligible.some((e) => e.id === player.id)) {
      weights.set(player.id, 0);
      continue;
    }

    const base = ROLE_MINUTE_WEIGHT[player.role];
    const starterBonus = starterIds.has(player.id) ? 5 : 0;
    const coachTweak = rng.nextRange(0.72, 1.32);
    const rookieOpportunity =
      player.role === 'ROOKIE' && rng.nextFloat() < 0.25 ? rng.nextRange(5, 11) : 0;
    const questionablePenalty = player.status === 'QUESTIONABLE' ? 0.72 : 1;

    const w = Math.max(
      2,
      (base + starterBonus + rookieOpportunity) * coachTweak * questionablePenalty,
    );
    weights.set(player.id, w);
    totalWeight += w;
  }

  const minutesById = new Map<string, number>();
  let assigned = 0;
  for (const player of roster) {
    const w = weights.get(player.id) ?? 0;
    if (w <= 0 || totalWeight <= 0) {
      minutesById.set(player.id, 0);
      continue;
    }
    const mins = Math.min(44, Math.max(0, Math.round((w / totalWeight) * totalTeamMinutes)));
    minutesById.set(player.id, mins);
    assigned += mins;
  }

  // Ajustamos diferencia exacta hasta totalTeamMinutes
  let diff = totalTeamMinutes - assigned;
  const activeList = eligible
    .slice()
    .sort((a, b) => (minutesById.get(b.id) ?? 0) - (minutesById.get(a.id) ?? 0));
  let cursor = 0;
  while (diff !== 0 && activeList.length > 0 && cursor < 200) {
    const target = activeList[cursor % activeList.length];
    if (target) {
      const current = minutesById.get(target.id) ?? 0;
      if (diff > 0 && current < 46) {
        minutesById.set(target.id, current + 1);
        diff -= 1;
      } else if (diff < 0 && current > 3) {
        minutesById.set(target.id, current - 1);
        diff += 1;
      }
    }
    cursor += 1;
  }

  return { starterIds, minutesById };
}

function generateTeamBoxes(params: {
  readonly team: EngineTeamInput;
  readonly opponentStrength: number;
  readonly isHome: boolean;
  readonly totalTeamMinutes: number;
  readonly scoringWeights: EngineScoringWeights;
  readonly injuryConfig: EngineInjuryConfig;
  readonly rng: DeterministicRng;
}): {
  readonly boxes: readonly SimulatedPlayerBox[];
  readonly events: readonly SimulatedMatchEvent[];
} {
  const { team, opponentStrength, isHome, totalTeamMinutes, scoringWeights, injuryConfig, rng } =
    params;

  const { starterIds, minutesById } = chooseRotationMinutes({
    roster: team.roster,
    totalTeamMinutes,
    rng,
  });

  const events: SimulatedMatchEvent[] = [];
  const boxes: SimulatedPlayerBox[] = [];

  const homeBoost = isHome ? 0.03 : 0;
  const teamVariance = rng.nextGaussian() * 0.07;

  for (const player of team.roster) {
    const plannedMinutes = Math.min(48, minutesById.get(player.id) ?? 0);
    const discipline = evaluateInGameDiscipline({
      player,
      minutesPlayed: plannedMinutes,
      config: injuryConfig,
      rng,
    });

    const injuryMinute = discipline.injured
      ? Math.max(2, Math.round(plannedMinutes * rng.nextRange(0.25, 0.7)))
      : Number.POSITIVE_INFINITY;

    if (plannedMinutes <= 0) {
      boxes.push({
        playerId: player.id,
        playerName: player.name,
        position: player.position,
        role: player.role,
        teamId: team.id,
        wasStarter: false,
        minutes: 0,
        pts: 0,
        reb: 0,
        ast: 0,
        stl: 0,
        blk: 0,
        td: 0,
        tov: 0,
        pf: 0,
        tf: 0,
        ft1: 0,
        ft2: 0,
        fantasyPoints: 0,
        ejected: false,
        disqualified: false,
        disqualificationReason: null,
        injured: false,
        nextStatus: discipline.nextStatus,
        nextGamesOut: discipline.nextGamesOut,
        statusReason: discipline.reason,
      });
      continue;
    }

    const oppFactor = Math.max(
      0.86,
      Math.min(1.16, 1 + (player.overallRating - opponentStrength) * 0.008),
    );
    const perMinuteSkill =
      (0.09 + (player.offense / 100) * 0.45 + homeBoost * 0.65 + teamVariance * 0.65) * oppFactor;
    const hotHand = rng.nextGaussian() * 0.11;

    const ptsRate = Math.max(0.08, perMinuteSkill + hotHand);
    const rebRate = Math.max(0.03, 0.085 + (player.rebounding / 100) * 0.24);
    const astRate = Math.max(0.02, 0.045 + (player.playmaking / 100) * 0.23);
    const stlRate = Math.max(0.006, 0.015 + (player.defense / 100) * 0.04);
    const blkRate = Math.max(
      0.004,
      (player.position === 'C' || player.position === 'PF' ? 0.045 : 0.014) * (player.defense / 80),
    );
    const tovRate = Math.max(0.015, 0.075 - (player.iq / 100) * 0.03);
    const pfRate = Math.max(0.04, 0.092 - (player.iq / 100) * 0.02 + rng.nextRange(-0.012, 0.025));
    const roleDisciplineScale = injuryConfig.ejectionChanceByRole[player.role] / 0.008;
    const tfRate = 0.0022 * roleDisciplineScale;
    const ft1Rate = 0.0007 * roleDisciplineScale;
    const ft2Rate = 0.00022 * roleDisciplineScale;

    let minutesPlayed = 0;
    let pts = 0;
    let reb = 0;
    let ast = 0;
    let stl = 0;
    let blk = 0;
    let tov = 0;
    let pf = 0;
    let tf = 0;
    let ft1 = 0;
    let ft2 = 0;

    let ptsCarry = 0;
    let rebCarry = 0;
    let astCarry = 0;
    let tovCarry = 0;

    let disqualified = false;
    let disqualificationReason: string | null = null;
    let injuredDuringMatch = false;

    for (let minute = 1; minute <= plannedMinutes; minute += 1) {
      ptsCarry += ptsRate * rng.nextRange(0.55, 1.45);
      const ptsStep = Math.floor(ptsCarry);
      if (ptsStep > 0) {
        pts += ptsStep;
        ptsCarry -= ptsStep;
      }

      rebCarry += rebRate * rng.nextRange(0.45, 1.55);
      const rebStep = Math.floor(rebCarry);
      if (rebStep > 0) {
        reb += rebStep;
        rebCarry -= rebStep;
      }

      astCarry += astRate * rng.nextRange(0.45, 1.55);
      const astStep = Math.floor(astCarry);
      if (astStep > 0) {
        ast += astStep;
        astCarry -= astStep;
      }

      if (rng.nextFloat() < Math.min(0.35, stlRate)) {
        stl += 1;
      }
      if (rng.nextFloat() < Math.min(0.35, blkRate)) {
        blk += 1;
      }

      tovCarry += tovRate * rng.nextRange(0.4, 1.6);
      const tovStep = Math.floor(tovCarry);
      if (tovStep > 0) {
        tov += tovStep;
        tovCarry -= tovStep;
      }

      if (rng.nextFloat() < pfRate) {
        pf += 1;
      }
      if (pf < 6 && rng.nextFloat() < tfRate * (tf === 1 ? 1.8 : 1)) {
        tf += 1;
      }
      if (pf < 6 && tf < 2 && rng.nextFloat() < ft1Rate) {
        ft1 += 1;
      }
      if (pf < 6 && tf < 2 && ft1 < 2 && rng.nextFloat() < ft2Rate) {
        ft2 += 1;
      }

      minutesPlayed = minute;

      // Al alcanzar cualquier límite de descalificación, se expulsa en el partido actual y cesan sus estadísticas
      if (pf >= 6) {
        disqualified = true;
        disqualificationReason = 'DQ_PF_6';
        break;
      }
      if (tf >= 2) {
        disqualified = true;
        disqualificationReason = 'DQ_TF_2';
        break;
      }
      if (ft1 >= 2) {
        disqualified = true;
        disqualificationReason = 'DQ_FT1_2';
        break;
      }
      if (ft2 >= 1) {
        disqualified = true;
        disqualificationReason = 'DQ_FT2_1';
        break;
      }
      if (discipline.injured && minute >= injuryMinute) {
        injuredDuringMatch = true;
        break;
      }
    }

    const breakdown = calculatePlayerDreamPointsBreakdown(
      { pts, reb, ast, stl, blk, tov, pf, tf, ft1, ft2, minutes: minutesPlayed },
      scoringWeights,
    );

    if (injuredDuringMatch) {
      events.push({
        quarter: Math.min(
          4,
          Math.max(1, Math.ceil((minutesPlayed / Math.max(1, plannedMinutes)) * 4)),
        ),
        clockLabel: `0${String(rng.nextInt(1, 9))}:${String(rng.nextInt(10, 59))}`,
        eventType: 'INJURY',
        playerId: player.id,
        teamId: team.id,
        description: `${player.name} (${team.code}) leaves the court: ${discipline.reason ?? 'injury'}.`,
      });
    } else if (disqualified && disqualificationReason) {
      const dqDetail =
        disqualificationReason === 'DQ_PF_6'
          ? '6 PF'
          : disqualificationReason === 'DQ_TF_2'
            ? '2 TF'
            : disqualificationReason === 'DQ_FT1_2'
              ? '2 FT1'
              : 'Flagrant 2';
      events.push({
        quarter: Math.min(
          4,
          Math.max(1, Math.ceil((minutesPlayed / Math.max(1, plannedMinutes)) * 4)),
        ),
        clockLabel: `0${String(rng.nextInt(1, 7))}:${String(rng.nextInt(10, 59))}`,
        eventType: 'EJECTION',
        playerId: player.id,
        teamId: team.id,
        description: `${player.name} (${team.code}) disqualified from match (${dqDetail}, min ${String(minutesPlayed)}).`,
      });
    }

    boxes.push({
      playerId: player.id,
      playerName: player.name,
      position: player.position,
      role: player.role,
      teamId: team.id,
      wasStarter: starterIds.has(player.id),
      minutes: minutesPlayed,
      pts,
      reb,
      ast,
      stl,
      blk,
      td: breakdown.tdCount,
      tov,
      pf,
      tf,
      ft1,
      ft2,
      fantasyPoints: breakdown.total,
      ejected: disqualified,
      disqualified,
      disqualificationReason,
      injured: injuredDuringMatch,
      // La descalificación se aplica únicamente al partido actual; solo las lesiones causan baja posterior
      nextStatus: injuredDuringMatch
        ? discipline.nextStatus
        : discipline.injured
          ? 'HEALTHY'
          : discipline.nextStatus,
      nextGamesOut: injuredDuringMatch ? discipline.nextGamesOut : 0,
      statusReason: injuredDuringMatch ? discipline.reason : null,
    });
  }

  return { boxes, events };
}

function teamAverageStrength(roster: readonly EnginePlayerInput[]): number {
  const healthy = roster.filter((p) => p.status !== 'INJURED' && p.status !== 'SUSPENDED');
  const pool = healthy.length > 0 ? healthy : roster;
  if (pool.length === 0) {
    return 70;
  }
  const top8 = [...pool].sort((a, b) => b.overallRating - a.overallRating).slice(0, 8);
  return top8.reduce((sum, p) => sum + p.overallRating, 0) / top8.length;
}

/**
 * Simula un partido completo de baloncesto con semilla determinista reproducible.
 * - Garantiza que nunca finalice en empate (resuelve prórroga si es necesario).
 * - Los roles influyen en oportunidades/minutos, pero la calidad, rival y aleatoriedad
 *   controlada pueden producir resultados sorprendentes.
 */
export function simulateBasketballMatch(params: {
  readonly homeTeam: EngineTeamInput;
  readonly awayTeam: EngineTeamInput;
  readonly seed: string;
  readonly scoringWeights: EngineScoringWeights;
  readonly injuryConfig: EngineInjuryConfig;
}): SimulateMatchOutput {
  const { homeTeam, awayTeam, seed, scoringWeights, injuryConfig } = params;
  const rng = createSeededRng(seed);

  const homeStrength = teamAverageStrength(homeTeam.roster);
  const awayStrength = teamAverageStrength(awayTeam.roster);

  const homeSim = generateTeamBoxes({
    team: homeTeam,
    opponentStrength: awayStrength,
    isHome: true,
    totalTeamMinutes: 240,
    scoringWeights,
    injuryConfig,
    rng,
  });

  const awaySim = generateTeamBoxes({
    team: awayTeam,
    opponentStrength: homeStrength,
    isHome: false,
    totalTeamMinutes: 240,
    scoringWeights,
    injuryConfig,
    rng,
  });

  const mutableBoxes = [...homeSim.boxes, ...awaySim.boxes];
  const events: SimulatedMatchEvent[] = [
    {
      quarter: 1,
      clockLabel: '12:00',
      eventType: 'TIPOFF',
      playerId: null,
      teamId: null,
      description: `Salto inicial entre ${awayTeam.name} y ${homeTeam.name}.`,
    },
    ...homeSim.events,
    ...awaySim.events,
  ];

  let homeScore = homeSim.boxes.reduce((sum, b) => sum + b.pts, 0);
  let awayScore = awaySim.boxes.reduce((sum, b) => sum + b.pts, 0);
  let overtimeCount = 0;

  while (homeScore === awayScore && overtimeCount < 4) {
    overtimeCount += 1;
    const homeOtBoost = rng.nextInt(7, 15);
    let awayOtBoost = rng.nextInt(7, 15);
    if (homeOtBoost === awayOtBoost) {
      awayOtBoost += rng.nextFloat() < 0.5 ? 2 : -2;
    }

    const applyOvertimeScorer = (teamId: string, otPts: number): void => {
      const idx = mutableBoxes.findIndex(
        (b) => b.teamId === teamId && b.minutes > 0 && !b.injured && !b.ejected && !b.disqualified,
      );
      const target = idx >= 0 ? mutableBoxes[idx] : undefined;
      if (!target) {
        return;
      }
      const updatedPts = target.pts + otPts;
      const updatedMins = Math.min(48, target.minutes + 5);
      const updatedBreakdown = calculatePlayerDreamPointsBreakdown(
        { ...target, pts: updatedPts, minutes: updatedMins },
        scoringWeights,
      );
      mutableBoxes[idx] = {
        ...target,
        pts: updatedPts,
        minutes: updatedMins,
        td: updatedBreakdown.tdCount,
        fantasyPoints: updatedBreakdown.total,
      };
    };

    applyOvertimeScorer(homeTeam.id, homeOtBoost);
    applyOvertimeScorer(awayTeam.id, awayOtBoost);

    homeScore += homeOtBoost;
    awayScore += awayOtBoost;

    events.push({
      quarter: 4 + overtimeCount,
      clockLabel: '00:00',
      eventType: 'OVERTIME',
      playerId: null,
      teamId: homeScore > awayScore ? homeTeam.id : awayTeam.id,
      description: `Prórroga ${String(overtimeCount)}: marcador ${String(awayScore)}-${String(homeScore)}.`,
    });
  }

  const mvp = [...mutableBoxes].sort((a, b) => b.fantasyPoints - a.fantasyPoints)[0];
  if (mvp) {
    events.push({
      quarter: 4 + overtimeCount,
      clockLabel: '00:00',
      eventType: 'FINAL',
      playerId: mvp.playerId,
      teamId: mvp.teamId,
      description: `Final ${awayTeam.code} ${String(awayScore)} - ${homeTeam.code} ${String(homeScore)}. MVP: ${mvp.playerName} (${String(mvp.pts)} PTS, ${String(mvp.fantasyPoints)} FP).`,
    });
  }

  return {
    seed,
    homeScore,
    awayScore,
    overtimeCount,
    homeTotals: buildTeamTotalsFromBoxes({
      teamId: homeTeam.id,
      teamName: homeTeam.name,
      teamCode: homeTeam.code,
      boxes: mutableBoxes,
    }),
    awayTotals: buildTeamTotalsFromBoxes({
      teamId: awayTeam.id,
      teamName: awayTeam.name,
      teamCode: awayTeam.code,
      boxes: mutableBoxes,
    }),
    playerBoxes: mutableBoxes,
    events,
  };
}
