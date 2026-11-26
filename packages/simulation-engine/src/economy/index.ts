import type { EngineAvailability, EnginePlayerRole, EnginePosition } from '../shared/types.js';

export interface MarketValuationInput {
  readonly playerId: string;
  readonly position: EnginePosition;
  readonly role: EnginePlayerRole;
  readonly age: number;
  readonly status: EngineAvailability;
  readonly currentPriceMillions: number;
  readonly avgFantasyPoints: number;
  readonly lastRoundFantasyPoints: number | null;
}

export interface MarketValuationConfig {
  readonly sensitivity: number;
  readonly minPriceMillions: number;
  readonly maxPriceMillions: number;
}

export interface MarketValuationResult {
  readonly playerId: string;
  readonly newPriceMillions: number;
  readonly deltaMillions: number;
}

/**
 * Recalcula precios dinámicos comparando rendimiento reciente contra la media
 * de jugadores de la misma posición, incorporando edad, rol y disponibilidad.
 */
export function recalculateMarketPrices(params: {
  readonly players: readonly MarketValuationInput[];
  readonly config: MarketValuationConfig;
}): readonly MarketValuationResult[] {
  const { players, config } = params;
  const avgByPos: Record<EnginePosition, number> = {
    PG: 5,
    SG: 5,
    SF: 5,
    PF: 5,
    C: 5,
  };

  for (const pos of ['PG', 'SG', 'SF', 'PF', 'C'] as const) {
    const group = players.filter((p) => p.position === pos);
    if (group.length > 0) {
      avgByPos[pos] = group.reduce((acc, p) => acc + p.avgFantasyPoints, 0) / group.length;
    }
  }

  return players.map((player) => {
    const positionalAvg = Math.max(2.5, avgByPos[player.position]);
    const effectiveFp =
      player.lastRoundFantasyPoints !== null
        ? player.avgFantasyPoints * 0.72 + player.lastRoundFantasyPoints * 0.28
        : player.avgFantasyPoints;
    const relativePerf = (effectiveFp - positionalAvg) / positionalAvg;
    const ageMultiplier = player.age <= 22 ? 1.06 : player.age >= 32 ? 0.92 : 1;
    const rawTarget = 12.6 * Math.pow(Math.max(0.2, effectiveFp + 1.5) / 4.5, 1.85) * ageMultiplier;
    const targetPrice = Math.max(
      config.minPriceMillions,
      Math.min(config.maxPriceMillions, rawTarget),
    );
    const convergenceGap =
      (targetPrice - player.currentPriceMillions) / Math.max(6, player.currentPriceMillions);
    const recentHeat =
      player.lastRoundFantasyPoints !== null
        ? ((player.lastRoundFantasyPoints - Math.max(1.5, player.avgFantasyPoints)) /
            Math.max(4, positionalAvg)) *
          (config.sensitivity * 0.45)
        : 0;
    const statusFactor =
      player.status === 'INJURED'
        ? -0.045
        : player.status === 'SUSPENDED'
          ? -0.03
          : player.status === 'QUESTIONABLE'
            ? -0.01
            : player.lastRoundFantasyPoints === 0
              ? -0.015
              : 0;

    const pctChange = Math.max(
      -0.12,
      Math.min(0.12, convergenceGap * 0.16 + recentHeat + relativePerf * 0.012 + statusFactor),
    );
    const unclamped = player.currentPriceMillions * (1 + pctChange);
    const newPriceMillions =
      Math.round(
        Math.max(config.minPriceMillions, Math.min(config.maxPriceMillions, unclamped)) * 10,
      ) / 10;
    const deltaMillions = Math.round((newPriceMillions - player.currentPriceMillions) * 10) / 10;

    return {
      playerId: player.playerId,
      newPriceMillions,
      deltaMillions,
    };
  });
}
