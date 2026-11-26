import type { DeterministicRng } from '../shared/prng.js';
import type { EngineAvailability, EngineInjuryConfig, EnginePlayerInput } from '../shared/types.js';

export interface InGameDisciplineResult {
  readonly ejected: boolean;
  readonly injured: boolean;
  readonly nextStatus: EngineAvailability;
  readonly nextGamesOut: number;
  readonly reason: string | null;
}

/**
 * Evalúa lesiones y expulsiones durante un partido teniendo en cuenta
 * edad, minutos jugados, rol y aleatoriedad controlada.
 */
export function evaluateInGameDiscipline(params: {
  readonly player: EnginePlayerInput;
  readonly minutesPlayed: number;
  readonly config: EngineInjuryConfig;
  readonly rng: DeterministicRng;
}): InGameDisciplineResult {
  const { player, minutesPlayed, config, rng } = params;

  if (minutesPlayed <= 0) {
    return {
      ejected: false,
      injured: false,
      nextStatus: player.status,
      nextGamesOut: 0,
      reason: null,
    };
  }

  const ageFactor = Math.max(0.75, 1 + (player.age - 26) * 0.035);
  const workloadFactor = Math.max(0.4, minutesPlayed / 28);
  const injuryChance = config.baseInjuryChancePerGame * ageFactor * workloadFactor;

  if (rng.nextFloat() < injuryChance) {
    const duration = rng.nextInt(config.injuryDurationGamesMin, config.injuryDurationGamesMax);
    const injuryReasons = [
      'Muscle strain',
      'Mild ankle sprain',
      'Knee contusion',
      'Hamstring soreness',
    ];
    const reason = injuryReasons[rng.nextInt(0, injuryReasons.length - 1)] ?? 'Physical injury';
    return {
      ejected: false,
      injured: true,
      nextStatus: 'INJURED',
      nextGamesOut: duration,
      reason: `${reason} (${String(duration)} ${duration === 1 ? 'game' : 'games'})`,
    };
  }

  if (rng.nextFloat() < config.questionableChancePerGame * ageFactor * workloadFactor) {
    return {
      ejected: false,
      injured: false,
      nextStatus: 'QUESTIONABLE',
      nextGamesOut: 0,
      reason: 'Minor post-game soreness (questionable)',
    };
  }

  return {
    ejected: false,
    injured: false,
    nextStatus: 'HEALTHY',
    nextGamesOut: 0,
    reason: null,
  };
}

export interface RecoveryStepOutput {
  readonly nextStatus: EngineAvailability;
  readonly nextGamesOut: number;
  readonly statusNote: string | null;
}

/**
 * Avanza una jornada la recuperación de jugadores que no jugaron por baja/sanción.
 */
export function advanceUnavailableStatusOneRound(params: {
  readonly currentStatus: EngineAvailability;
  readonly gamesOutRemaining: number;
  readonly statusNote: string | null;
}): RecoveryStepOutput {
  const { currentStatus, gamesOutRemaining, statusNote } = params;
  if (currentStatus === 'INJURED' || currentStatus === 'SUSPENDED') {
    const remaining = Math.max(0, gamesOutRemaining - 1);
    if (remaining === 0) {
      return {
        nextStatus: 'HEALTHY',
        nextGamesOut: 0,
        statusNote: null,
      };
    }
    return {
      nextStatus: currentStatus,
      nextGamesOut: remaining,
      statusNote,
    };
  }
  if (currentStatus === 'QUESTIONABLE') {
    return {
      nextStatus: 'HEALTHY',
      nextGamesOut: 0,
      statusNote: null,
    };
  }
  return {
    nextStatus: 'HEALTHY',
    nextGamesOut: 0,
    statusNote: null,
  };
}
