import { evaluateInGameDiscipline } from '../injuries/index.js';
import { calculatePlayerFantasyPoints } from '../scoring/index.js';
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
    const plannedMinutes = minutesById.get(player.id) ?? 0;
    const discipline = evaluateInGameDiscipline({
      player,
      minutesPlayed: plannedMinutes,
      config: injuryConfig,
      rng,
    });

    const effectiveMinutes =
      discipline.injured || discipline.ejected
        ? Math.max(4, Math.round(plannedMinutes * rng.nextRange(0.25, 0.7)))
        : plannedMinutes;

    if (effectiveMinutes <= 0) {
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
        tov: 0,
        pf: 0,
        fantasyPoints: 0,
        ejected: false,
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
      (0.32 + (player.offense / 100) * 0.42 + homeBoost + teamVariance) * oppFactor;
    const hotHand = rng.nextGaussian() * 0.18;

    const pts = Math.max(
      0,
      Math.round(effectiveMinutes * Math.max(0.12, perMinuteSkill + hotHand)),
    );
    const reb = Math.max(
      0,
      Math.round(
        effectiveMinutes * (0.09 + (player.rebounding / 100) * 0.24) + rng.nextGaussian() * 1.4,
      ),
    );
    const ast = Math.max(
      0,
      Math.round(
        effectiveMinutes * (0.05 + (player.playmaking / 100) * 0.23) + rng.nextGaussian() * 1.2,
      ),
    );
    const stl = Math.max(
      0,
      Math.round(
        effectiveMinutes * (0.015 + (player.defense / 100) * 0.04) + rng.nextRange(-0.4, 0.9),
      ),
    );
    const blk = Math.max(
      0,
      Math.round(
        effectiveMinutes *
          (player.position === 'C' || player.position === 'PF' ? 0.045 : 0.014) *
          (player.defense / 80) +
          rng.nextRange(-0.4, 0.8),
      ),
    );
    const tov = Math.max(
      0,
      Math.round(effectiveMinutes * (0.075 - (player.iq / 100) * 0.03) + rng.nextRange(-0.5, 1.1)),
    );
    const pf = Math.min(
      6,
      Math.max(0, Math.round(effectiveMinutes * 0.08 + rng.nextRange(-0.6, 1.4))),
    );

    const fantasyPoints = calculatePlayerFantasyPoints(
      { pts, reb, ast, stl, blk, tov, pf, minutes: effectiveMinutes },
      scoringWeights,
    );

    if (discipline.injured) {
      events.push({
        quarter: rng.nextInt(1, 4),
        clockLabel: `0${String(rng.nextInt(1, 9))}:${String(rng.nextInt(10, 59))}`,
        eventType: 'INJURY',
        playerId: player.id,
        teamId: team.id,
        description: `${player.name} (${team.code}) abandona la pista: ${discipline.reason ?? 'lesión'}.`,
      });
    } else if (discipline.ejected) {
      events.push({
        quarter: rng.nextInt(2, 4),
        clockLabel: `0${String(rng.nextInt(1, 7))}:${String(rng.nextInt(10, 59))}`,
        eventType: 'EJECTION',
        playerId: player.id,
        teamId: team.id,
        description: `${player.name} (${team.code}) es expulsado del encuentro.`,
      });
    }

    boxes.push({
      playerId: player.id,
      playerName: player.name,
      position: player.position,
      role: player.role,
      teamId: team.id,
      wasStarter: starterIds.has(player.id),
      minutes: effectiveMinutes,
      pts,
      reb,
      ast,
      stl,
      blk,
      tov,
      pf,
      fantasyPoints,
      ejected: discipline.ejected,
      injured: discipline.injured,
      nextStatus: discipline.nextStatus,
      nextGamesOut: discipline.nextGamesOut,
      statusReason: discipline.reason,
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

    const homeScorerIdx = mutableBoxes.findIndex(
      (b) => b.teamId === homeTeam.id && b.minutes > 0 && !b.injured && !b.ejected,
    );
    const awayScorerIdx = mutableBoxes.findIndex(
      (b) => b.teamId === awayTeam.id && b.minutes > 0 && !b.injured && !b.ejected,
    );

    if (homeScorerIdx >= 0) {
      const target = mutableBoxes[homeScorerIdx];
      if (target) {
        const updatedPts = target.pts + homeOtBoost;
        const updatedMins = Math.min(53, target.minutes + 5);
        mutableBoxes[homeScorerIdx] = {
          ...target,
          pts: updatedPts,
          minutes: updatedMins,
          fantasyPoints: calculatePlayerFantasyPoints(
            { ...target, pts: updatedPts, minutes: updatedMins },
            scoringWeights,
          ),
        };
      }
    }
    if (awayScorerIdx >= 0) {
      const target = mutableBoxes[awayScorerIdx];
      if (target) {
        const updatedPts = target.pts + awayOtBoost;
        const updatedMins = Math.min(53, target.minutes + 5);
        mutableBoxes[awayScorerIdx] = {
          ...target,
          pts: updatedPts,
          minutes: updatedMins,
          fantasyPoints: calculatePlayerFantasyPoints(
            { ...target, pts: updatedPts, minutes: updatedMins },
            scoringWeights,
          ),
        };
      }
    }

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
