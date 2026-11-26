import type { DeterministicRng } from '../shared/prng.js';
import type { EnginePlayerRole } from '../shared/types.js';

export interface ProgressionInput {
  readonly age: number;
  readonly role: EnginePlayerRole;
  readonly overallRating: number;
  readonly avgFantasyPoints: number;
  readonly gamesPlayed: number;
}

export interface ProgressionConfig {
  readonly evaluateEveryGames: number;
  readonly promoteMinFpDelta: number;
  readonly demoteMaxFpDelta: number;
}

export interface ProgressionOutput {
  readonly overallDelta: number;
  readonly newOverallRating: number;
  readonly newRole: EnginePlayerRole;
}

const ROLE_EXPECTED_FP: Record<EnginePlayerRole, number> = {
  SUPERSTAR: 11.5,
  STAR: 8.0,
  STARTER: 5.0,
  ROTATION: 2.8,
  ROOKIE: 2.0,
  BENCH: 0.8,
};

function clampRating(value: number): number {
  return Math.max(48, Math.min(99, Math.round(value)));
}

/**
 * Evalúa progresión de atributos y ajuste configurable de rol según rendimiento,
 * oportunidades, curva de edad y variación controlada (sin garantizar cambios mecánicos).
 */
export function evaluatePlayerProgression(params: {
  readonly input: ProgressionInput;
  readonly teamAlreadyHasSuperstar: boolean;
  readonly config: ProgressionConfig;
  readonly rng: DeterministicRng;
}): ProgressionOutput {
  const { input, teamAlreadyHasSuperstar, config, rng } = params;
  if (input.gamesPlayed === 0 || input.gamesPlayed % config.evaluateEveryGames !== 0) {
    return {
      overallDelta: 0,
      newOverallRating: input.overallRating,
      newRole: input.role,
    };
  }

  const expected = ROLE_EXPECTED_FP[input.role];
  const perfDelta = input.avgFantasyPoints - expected;
  const ageDrift = input.age <= 23 ? 0.8 : input.age >= 32 ? -0.7 : 0.1;
  const noise = rng.nextRange(-0.9, 0.9);
  const rawShift = perfDelta * 0.22 + ageDrift + noise;
  const overallDelta = Math.max(-2, Math.min(2, Math.round(rawShift)));
  const newOverallRating = clampRating(input.overallRating + overallDelta);

  let newRole = input.role;
  if (perfDelta >= config.promoteMinFpDelta && rng.nextFloat() < 0.45) {
    if (input.role === 'BENCH') {
      newRole = 'ROTATION';
    } else if (input.role === 'ROOKIE') {
      newRole = 'STARTER';
    } else if (input.role === 'ROTATION') {
      newRole = 'STARTER';
    } else if (input.role === 'STARTER') {
      newRole = 'STAR';
    } else if (input.role === 'STAR' && !teamAlreadyHasSuperstar) {
      newRole = 'SUPERSTAR';
    }
  } else if (perfDelta <= config.demoteMaxFpDelta && rng.nextFloat() < 0.45) {
    if (input.role === 'STAR') {
      newRole = 'STARTER';
    } else if (input.role === 'STARTER') {
      newRole = 'ROTATION';
    } else if (input.role === 'ROTATION') {
      newRole = 'BENCH';
    }
  }

  return {
    overallDelta,
    newOverallRating,
    newRole,
  };
}
