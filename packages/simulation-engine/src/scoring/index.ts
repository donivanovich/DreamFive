import type { EngineScoringWeights } from '../shared/types.js';

export interface StatLineForScoring {
  readonly pts: number;
  readonly reb: number;
  readonly ast: number;
  readonly stl: number;
  readonly blk: number;
  readonly tov: number;
  readonly pf: number;
  readonly minutes: number;
}

/**
 * Fórmula configurable de puntuación fantasy.
 * No fija reglas oficiales: recibe los pesos desde configuración externa.
 */
export function calculatePlayerFantasyPoints(
  stats: StatLineForScoring,
  weights: EngineScoringWeights,
): number {
  const raw =
    stats.pts * weights.pts +
    stats.reb * weights.reb +
    stats.ast * weights.ast +
    stats.stl * weights.stl +
    stats.blk * weights.blk +
    stats.tov * weights.tov +
    stats.pf * weights.pf +
    stats.minutes * weights.min;
  return Math.round(raw * 10) / 10;
}

export function sumFantasyPoints(scores: readonly number[]): number {
  const sum = scores.reduce((acc, value) => acc + value, 0);
  return Math.round(sum * 10) / 10;
}
