export interface ComputeNextLeagueClockParams {
  readonly currentGameClockAt: Date;
  readonly seasonStartedAt: Date;
  readonly isAccelerated: boolean;
  readonly prevWallMs?: number;
  readonly nowMs: number;
}

const MAX_WALL_STEP_MS = 24 * 3600_000;
const REALTIME_ANCHOR_TOLERANCE_MS = 30 * 60_000;
const SEASON_START_SYNC_THRESHOLD_MS = 2 * 3600_000;

/**
 * Calcula el siguiente instante del reloj de liga para el planificador 24/7:
 * - Si la liga opera en tiempo real sincronizado (`!isAccelerated`), sigue 1:1
 *   el reloj del servidor/PC host sin deriva ni retrocesos.
 * - Si espera el arranque de una temporada futura recién abierta (mes siguiente),
 *   mantiene esa marca hasta que el reloj real la alcance.
 * - Si está acelerada o aún en modo día 1 sin sincronizar, suma el delta real
 *   transcurrido desde el último tick sin depender de `league.updatedAt`.
 */
export function computeNextLeagueClock(params: ComputeNextLeagueClockParams): Date {
  const { currentGameClockAt, seasonStartedAt, isAccelerated, prevWallMs, nowMs } = params;
  const currentClockMs = currentGameClockAt.getTime();
  const safeDeltaMs =
    prevWallMs !== undefined ? Math.max(0, Math.min(MAX_WALL_STEP_MS, nowMs - prevWallMs)) : 0;

  if (isAccelerated) {
    return new Date(currentClockMs + safeDeltaMs);
  }

  // Tras un rollover automático al día 1 del mes siguiente, espera sin retroceder.
  if (currentClockMs > nowMs) {
    return currentGameClockAt;
  }

  const syncedOnPrevTick =
    prevWallMs !== undefined &&
    Math.abs(currentClockMs - prevWallMs) <= REALTIME_ANCHOR_TOLERANCE_MS;
  const pastInitialSeasonOffset =
    currentClockMs >= seasonStartedAt.getTime() + SEASON_START_SYNC_THRESHOLD_MS;

  if (syncedOnPrevTick || pastInitialSeasonOffset) {
    return new Date(Math.max(currentClockMs, nowMs));
  }

  return new Date(currentClockMs + safeDeltaMs);
}
