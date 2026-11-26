import type { EngineScoringWeights } from '../shared/types.js';

export interface StatLineForScoring {
  readonly pts: number;
  readonly reb: number;
  readonly ast: number;
  readonly stl: number;
  readonly blk: number;
  readonly tov: number;
  readonly pf: number;
  readonly tf?: number;
  readonly ft1?: number;
  readonly ft2?: number;
  readonly minutes: number;
}

export interface DreamPointsBreakdown {
  readonly minutes: number;
  readonly pts: number;
  readonly reb: number;
  readonly ast: number;
  readonly stl: number;
  readonly blk: number;
  readonly td: number;
  readonly tdCount: 0 | 1;
  readonly tov: number;
  readonly pf: number;
  readonly tf: number;
  readonly ft1: number;
  readonly ft2: number;
  readonly total: number;
}

function floorStepPoints(value: number, divisor: number, weight: number): number {
  const safeDivisor = Math.max(1, divisor);
  const steps = Math.floor(Math.max(0, value) / safeDivisor);
  return Math.round(steps * weight * 10) / 10;
}

/**
 * Calcula el desglose oficial de Dream Points según las reglas NBA:
 * - MIN: +1 por cada 10 min (máx. 48 min y 4 pts, sin decimales).
 * - PTS: +1 por cada 5 pts (sin decimales).
 * - REB / AST: +1 por cada 2 (sin decimales).
 * - STL / BLK: +1 cada uno.
 * - TD (triple-doble): +4 una única vez por partido (3+ categorías >= 10).
 * - TOV (-1), PF (-1), TF (-2), FT1 (-3), FT2 (-5).
 * - El total puede ser negativo si superan las penalizaciones.
 */
export function calculatePlayerDreamPointsBreakdown(
  stats: StatLineForScoring,
  weights: EngineScoringWeights,
): DreamPointsBreakdown {
  const cappedMinutes = Math.min(weights.minMaxMinutes, Math.max(0, Math.trunc(stats.minutes)));
  const minRaw = floorStepPoints(cappedMinutes, weights.minDivisor, weights.min);
  const minutesDp = Math.min(weights.minMaxPoints, minRaw);

  const ptsDp = floorStepPoints(stats.pts, weights.ptsDivisor, weights.pts);
  const rebDp = floorStepPoints(stats.reb, weights.rebDivisor, weights.reb);
  const astDp = floorStepPoints(stats.ast, weights.astDivisor, weights.ast);
  const stlDp = Math.round(Math.max(0, Math.trunc(stats.stl)) * weights.stl * 10) / 10;
  const blkDp = Math.round(Math.max(0, Math.trunc(stats.blk)) * weights.blk * 10) / 10;

  const doubleDigitCategories = [stats.pts, stats.reb, stats.ast, stats.stl, stats.blk].filter(
    (value) => value >= 10,
  ).length;
  const tdCount: 0 | 1 = doubleDigitCategories >= 3 ? 1 : 0;
  const tdDp = tdCount === 1 ? Math.round(weights.td * 10) / 10 : 0;

  const tovDp = Math.round(Math.max(0, Math.trunc(stats.tov)) * weights.tov * 10) / 10;
  const pfDp = Math.round(Math.max(0, Math.trunc(stats.pf)) * weights.pf * 10) / 10;
  const tfDp = Math.round(Math.max(0, Math.trunc(stats.tf ?? 0)) * weights.tf * 10) / 10;
  const ft1Dp = Math.round(Math.max(0, Math.trunc(stats.ft1 ?? 0)) * weights.ft1 * 10) / 10;
  const ft2Dp = Math.round(Math.max(0, Math.trunc(stats.ft2 ?? 0)) * weights.ft2 * 10) / 10;

  const total =
    Math.round(
      (minutesDp +
        ptsDp +
        rebDp +
        astDp +
        stlDp +
        blkDp +
        tdDp +
        tovDp +
        pfDp +
        tfDp +
        ft1Dp +
        ft2Dp) *
        10,
    ) / 10;

  return {
    minutes: minutesDp,
    pts: ptsDp,
    reb: rebDp,
    ast: astDp,
    stl: stlDp,
    blk: blkDp,
    td: tdDp,
    tdCount,
    tov: tovDp,
    pf: pfDp,
    tf: tfDp,
    ft1: ft1Dp,
    ft2: ft2Dp,
    total,
  };
}

/**
 * Fórmula oficial de Dream Points para el partido de un jugador.
 */
export function calculatePlayerFantasyPoints(
  stats: StatLineForScoring,
  weights: EngineScoringWeights,
): number {
  return calculatePlayerDreamPointsBreakdown(stats, weights).total;
}

export function sumFantasyPoints(scores: readonly number[]): number {
  const sum = scores.reduce((acc, value) => acc + value, 0);
  return Math.round(sum * 10) / 10;
}
