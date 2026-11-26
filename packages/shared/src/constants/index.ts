import type { PlayerRole } from '../enums/index.js';

/**
 * Nombres de colas compartidos entre productor (API) y consumidor (Worker).
 */
export const QUEUE_NAMES = {
  simulation: 'simulation',
  market: 'market',
  injuries: 'injuries',
  progression: 'progression',
  rankings: 'rankings',
  seasons: 'seasons',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

/** Lista inmutable de todas las colas registradas. */
export const ALL_QUEUE_NAMES: readonly QueueName[] = Object.values(QUEUE_NAMES);

export const JOB_NAMES = {
  schedulerTick: 'scheduler-tick',
  simulateRound: 'simulate-round',
  simulateMatch: 'simulate-match',
  repriceLeagueMarket: 'reprice-league-market',
  processLeagueInjuries: 'process-league-injuries',
  processLeagueProgression: 'process-league-progression',
  recalculateStandings: 'recalculate-standings',
  seasonRollover: 'season-rollover',
} as const;

export const SOCKET_EVENTS = {
  joinLeagueRoom: 'league:room.join',
  leaveLeagueRoom: 'league:room.leave',
  clockUpdated: 'league:clock.updated',
  matchUpdated: 'league:match.updated',
  roundCompleted: 'league:round.completed',
  standingsUpdated: 'league:standings.updated',
  marketUpdated: 'league:market.updated',
  transferUpdated: 'league:transfer.updated',
  seasonRollover: 'league:season.rollover',
  mailUpdated: 'league:mail.updated',
} as const;

export const REDIS_CHANNELS = {
  leagueRealtimeEvents: 'dreamfive:realtime:league-events',
} as const;

export interface ScoringWeightsConfig {
  /** Reglas oficiales NBA de Dream Points (multiplicadores, divisores y topes). */
  readonly pts: number;
  readonly reb: number;
  readonly ast: number;
  readonly stl: number;
  readonly blk: number;
  readonly td: number;
  readonly tov: number;
  readonly pf: number;
  readonly tf: number;
  readonly ft1: number;
  readonly ft2: number;
  readonly min: number;
  readonly ptsDivisor: number;
  readonly rebDivisor: number;
  readonly astDivisor: number;
  readonly minDivisor: number;
  readonly minMaxPoints: number;
  readonly minMaxMinutes: number;
}

export const DREAMFIVE_NBA_SCORING_RULES = {
  minPerPoint: 10,
  minMaxPoints: 4,
  minMaxMinutes: 48,
  ptsPerPoint: 5,
  rebPerPoint: 2,
  astPerPoint: 2,
  stlPoints: 1,
  blkPoints: 1,
  tripleDoublePoints: 4,
  tovPoints: -1,
  pfPoints: -1,
  pfDisqualificationLimit: 6,
  tfPoints: -2,
  tfDisqualificationLimit: 2,
  ft1Points: -3,
  ft1DisqualificationLimit: 2,
  ft2Points: -5,
  ft2DisqualificationLimit: 1,
} as const;

export interface SeasonResetConfig {
  /** PROVISIONAL: políticas configurables de reinicio mensual entre temporadas. */
  readonly keepPlayers: boolean;
  readonly keepTradeHistory: boolean;
  readonly resetFantasyPoints: boolean;
  readonly resetStandings: boolean;
  readonly resetInjuriesAndSuspensions: boolean;
  readonly resetBudgetToInitial: boolean;
}

export interface LeagueCreationRules {
  readonly totalTeams: 30;
  readonly squadSize: 18;
  readonly startersCount: 5;
  readonly maxParticipants: 30;
  readonly maxPresidenciesPerUser: 1;
  readonly minTradeValueRatio: 0.5;
  readonly seasonTotalRounds: 58;
  readonly matchesPerRound: 15;
  readonly dailyWindowStartHour: 8;
  readonly dailyWindowEndHour: 20;
}

export const DEFAULT_LEAGUE_TIME_ZONE = 'Europe/Madrid';

export const LEAGUE_RULES: LeagueCreationRules = {
  totalTeams: 30,
  squadSize: 18,
  startersCount: 5,
  maxParticipants: 30,
  maxPresidenciesPerUser: 1,
  minTradeValueRatio: 0.5,
  seasonTotalRounds: 58,
  matchesPerRound: 15,
  dailyWindowStartHour: 8,
  dailyWindowEndHour: 20,
} as const;

export const MANDATORY_ROLE_DISTRIBUTION: Record<PlayerRole, number> = {
  SUPERSTAR: 1,
  STAR: 2,
  STARTER: 2,
  ROTATION: 5,
  ROOKIE: 3,
  BENCH: 5,
};

/**
 * PARÁMETROS PROVISIONALES DEL JUEGO (PENDIENTES DE DEFINICIÓN DEFINITIVA).
 * Se centralizan aquí para poder probar el prototipo Full Stack sin convertirlos
 * en reglas definitivas inamovibles.
 */
export const PROVISIONAL_GAME_CONFIG = {
  scoringWeights: {
    pts: 1,
    reb: 1,
    ast: 1,
    stl: 1,
    blk: 1,
    td: 4,
    tov: -1,
    pf: -1,
    tf: -2,
    ft1: -3,
    ft2: -5,
    min: 1,
    ptsDivisor: DREAMFIVE_NBA_SCORING_RULES.ptsPerPoint,
    rebDivisor: DREAMFIVE_NBA_SCORING_RULES.rebPerPoint,
    astDivisor: DREAMFIVE_NBA_SCORING_RULES.astPerPoint,
    minDivisor: DREAMFIVE_NBA_SCORING_RULES.minPerPoint,
    minMaxPoints: DREAMFIVE_NBA_SCORING_RULES.minMaxPoints,
    minMaxMinutes: DREAMFIVE_NBA_SCORING_RULES.minMaxMinutes,
  } satisfies ScoringWeightsConfig,

  lineupRules: {
    /** PROVISIONAL: minutos de antelación al cierre de jornada (pendiente de regla final). */
    lockMinutesBeforeTipoff: 5,
    /** PROVISIONAL: no sustituye automáticamente a lesionados salvo configuración futura. */
    autoSubstituteUnavailable: false,
  },

  injuriesAndEjections: {
    /** PROVISIONAL: probabilidad base por partido ajustada por edad y minutos. */
    baseInjuryChancePerGame: 0.014,
    questionableChancePerGame: 0.02,
    injuryDurationGamesMin: 1,
    injuryDurationGamesMax: 4,
    /** PROVISIONAL: probabilidad diferenciada por rol (usada para descalificaciones por técnicas/flagrantes). */
    ejectionChanceByRole: {
      SUPERSTAR: 0.011,
      STAR: 0.009,
      STARTER: 0.007,
      ROTATION: 0.007,
      ROOKIE: 0.013,
      BENCH: 0.004,
    } satisfies Record<PlayerRole, number>,
  },

  progression: {
    /** PROVISIONAL: evaluación cada N partidos jugados en temporada. */
    evaluateEveryGames: 5,
    promoteMinFpDelta: 2.5,
    demoteMaxFpDelta: -2.5,
  },

  economyAndMarket: {
    /** PROVISIONAL: presupuesto inicial estándar de cada equipo al crear liga (escala x3). */
    initialTeamBudgetMillions: 75.0,
    /** Recompensa económica al ganador de cada partido: Dream Points de la jornada x 100.000. */
    winRewardPerFantasyPoint: 100_000,
    hourlyRepriceSensitivity: 0.06,
    minPlayerPriceMillions: 1.5,
    maxPlayerPriceMillions: 135.0,
    /** PROVISIONAL: criterio automático de equipos CPU ante ofertas válidas. */
    cpuAutoEvaluateEnabled: true,
    cpuAcceptMinRatio: 0.96,
  },

  transfers: {
    /** Expiración por defecto de ofertas pendientes en horas de juego. */
    offerExpirationHours: 48,
    /** Partidos de espera antes de volver a negociar tras un rechazo (bloquea propuesto y deseado). */
    rejectionCooldownMatches: 1,
    /** Partidos de espera obligatorios tras incorporar a un jugador en un traspaso. */
    acquiredPlayerLockMatches: 5,
  },
  auth: {
    /** Longitud del código numérico de verificación por correo. */
    emailVerificationCodeLength: 6,
    /** Minutos de validez de los códigos de verificación por correo. */
    emailVerificationTtlMinutes: 15,
    /** Minutos de validez del enlace único para restablecer contraseña. */
    passwordResetTtlMinutes: 30,
  },

  seasonReset: {
    keepPlayers: true,
    keepTradeHistory: true,
    resetFantasyPoints: true,
    resetStandings: true,
    resetInjuriesAndSuspensions: true,
    resetBudgetToInitial: false,
  } satisfies SeasonResetConfig,
} as const;

export const ADMIN_SIMULATION_EMAIL = 'ivan.k@dreamfive.local';

export const THEME_MODES = ['dark', 'light'] as const;

export const ACCENT_COLORS = ['orange', 'blue', 'green', 'red', 'pink', 'purple'] as const;

export const SUPPORTED_LANGUAGES = ['en', 'es'] as const;

/**
 * Normaliza configuraciones de puntuación guardadas en BD hacia las reglas
 * oficiales NBA de Dream Points (actualizando automáticamente ligas heredadas
 * sin divisores configurados).
 */
export function parseLeagueScoringWeights(raw: unknown): ScoringWeightsConfig {
  const defaults = PROVISIONAL_GAME_CONFIG.scoringWeights;
  if (!raw || typeof raw !== 'object') {
    return defaults;
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj['ptsDivisor'] !== 'number' || !Number.isFinite(obj['ptsDivisor'])) {
    return defaults;
  }
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
    td: readNum('td'),
    tov: readNum('tov'),
    pf: readNum('pf'),
    tf: readNum('tf'),
    ft1: readNum('ft1'),
    ft2: readNum('ft2'),
    min: readNum('min'),
    ptsDivisor: readNum('ptsDivisor'),
    rebDivisor: readNum('rebDivisor'),
    astDivisor: readNum('astDivisor'),
    minDivisor: readNum('minDivisor'),
    minMaxPoints: readNum('minMaxPoints'),
    minMaxMinutes: readNum('minMaxMinutes'),
  };
}
