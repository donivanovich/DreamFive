export interface ScheduledFixture {
  readonly roundNumber: number;
  readonly matchIndexInRound: number;
  readonly homeTeamId: string;
  readonly awayTeamId: string;
  readonly scheduledAtIso: string;
}

export interface RoundCalendarDay {
  readonly dayOfMonth: number;
  readonly roundNumber: number;
  readonly scheduledAtIso: string;
}

export interface ScheduledMatchSlot {
  readonly dayOfMonth: number;
  readonly roundNumber: number;
  readonly matchIndexInRound: number;
  readonly scheduledAtIso: string;
}

/**
 * Convierte una fecha/hora de reloj de pared `(year, month, dayOfMonth, hour, minute)` en una zona
 * horaria IANA concreta (p. ej. `Europe/Madrid`) a su instante ISO UTC exacto.
 */
export function resolveZonedDateIso(params: {
  readonly year: number;
  readonly month: number;
  readonly dayOfMonth: number;
  readonly hour: number;
  readonly minute: number;
  readonly timeZone?: string;
}): string {
  const { year, month, dayOfMonth, hour, minute, timeZone } = params;
  const utcGuessMs = Date.UTC(year, month - 1, dayOfMonth, hour, minute, 0, 0);
  if (!timeZone || timeZone === 'UTC') {
    return new Date(utcGuessMs).toISOString();
  }

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date(utcGuessMs));

  const readPart = (type: Intl.DateTimeFormatPartTypes): number => {
    const raw = parts.find((p) => p.type === type)?.value;
    return raw ? Number.parseInt(raw, 10) : 0;
  };

  const renderedHour = readPart('hour') === 24 ? 0 : readPart('hour');
  const tzRenderedAsUtcMs = Date.UTC(
    readPart('year'),
    readPart('month') - 1,
    readPart('day'),
    renderedHour,
    readPart('minute'),
    readPart('second'),
  );
  const offsetMs = tzRenderedAsUtcMs - utcGuessMs;
  return new Date(utcGuessMs - offsetMs).toISOString();
}

/**
 * Devuelve el número exacto de días del mes natural teniendo en cuenta años bisiestos.
 */
export function getDaysInCalendarMonth(year: number, month: number): number {
  if (month < 1 || month > 12) {
    throw new Error(`Mes inválido: ${String(month)}`);
  }
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Calcula cuántas jornadas tocan cada día del mes (28/29/30/31) para sumar
 * exactamente 58 jornadas sin concentrar los días atípicos al inicio o final:
 * - 28 días: 26 días × 2 jornadas + 2 días × 3 jornadas = 58
 * - 29 días: 29 días × 2 jornadas = 58
 * - 30 días: 28 días × 2 jornadas + 2 días × 1 jornada = 58
 * - 31 días: 27 días × 2 jornadas + 4 días × 1 jornada = 58
 */
export function buildDailyRoundCounts(daysInMonth: number): readonly number[] {
  const counts = Array.from({ length: daysInMonth }, () => 2);
  if (daysInMonth === 28) {
    // Días 10 y 19 (1-based) pasan a 3 jornadas -> 58 en total
    counts[9] = 3;
    counts[18] = 3;
    return counts;
  }
  if (daysInMonth === 29) {
    return counts;
  }
  if (daysInMonth === 30) {
    // Días 10 y 21 (1-based) pasan a 1 jornada -> 58 en total
    counts[9] = 1;
    counts[20] = 1;
    return counts;
  }
  if (daysInMonth === 31) {
    // Días 6, 13, 20 y 27 (1-based) pasan a 1 jornada -> 58 en total
    counts[5] = 1;
    counts[12] = 1;
    counts[19] = 1;
    counts[26] = 1;
    return counts;
  }
  throw new Error(`Duración de mes no soportada: ${String(daysInMonth)}`);
}

/**
 * Reparte equitativamente todos los partidos de cada día natural entre `startHour` (08:00)
 * y `endHour` (20:00) respetando estrictamente el orden cronológico de jornadas y partidos:
 * - Día de 2 jornadas (30 partidos): intervalos uniformes de ~25 minutos desde las 08:00 hasta las 20:00.
 * - Día de 1 jornada (15 partidos): intervalos uniformes de ~51 minutos desde las 08:00 hasta las 20:00.
 * - Día de 3 jornadas (45 partidos): intervalos uniformes de ~16 minutos desde las 08:00 hasta las 20:00.
 */
export function distributeMatchSlotsAcrossMonth(params: {
  readonly year: number;
  readonly month: number;
  readonly startHour?: number;
  readonly endHour?: number;
  readonly matchesPerRound?: number;
  readonly timeZone?: string;
}): readonly ScheduledMatchSlot[] {
  const { year, month, startHour = 8, endHour = 20, matchesPerRound = 15, timeZone } = params;
  const daysInMonth = getDaysInCalendarMonth(year, month);
  const dailyCounts = buildDailyRoundCounts(daysInMonth);
  const spanMinutes = Math.max(0, (endHour - startHour) * 60);
  const startBaseMinutes = startHour * 60;
  const slots: ScheduledMatchSlot[] = [];
  let nextRoundNumber = 1;

  for (let dayIdx = 0; dayIdx < dailyCounts.length; dayIdx += 1) {
    const dayOfMonth = dayIdx + 1;
    const roundsToday = dailyCounts[dayIdx] ?? 2;
    const totalSlotsToday = roundsToday * matchesPerRound;

    for (let slotIdx = 0; slotIdx < totalSlotsToday; slotIdx += 1) {
      const roundOffset = Math.floor(slotIdx / matchesPerRound);
      const matchIndexInRound = slotIdx % matchesPerRound;
      const roundNumber = nextRoundNumber + roundOffset;
      const offsetMinutes =
        totalSlotsToday > 1 ? Math.round((slotIdx * spanMinutes) / (totalSlotsToday - 1)) : 0;
      const totalMinutes = startBaseMinutes + offsetMinutes;
      const hour = Math.floor(totalMinutes / 60);
      const minute = totalMinutes % 60;

      slots.push({
        dayOfMonth,
        roundNumber,
        matchIndexInRound,
        scheduledAtIso: resolveZonedDateIso({
          year,
          month,
          dayOfMonth,
          hour,
          minute,
          ...(timeZone ? { timeZone } : {}),
        }),
      });
    }

    nextRoundNumber += roundsToday;
  }

  return slots;
}

/**
 * Devuelve la hora de apertura de cada una de las 58 jornadas entre startHour (08:00)
 * y endHour (20:00) dentro del mes natural indicado.
 */
export function distributeRoundsAcrossMonth(params: {
  readonly year: number;
  readonly month: number;
  readonly startHour?: number;
  readonly endHour?: number;
  readonly timeZone?: string;
}): readonly RoundCalendarDay[] {
  const matchSlots = distributeMatchSlotsAcrossMonth(params);
  const rounds: RoundCalendarDay[] = [];
  for (const slot of matchSlots) {
    if (slot.matchIndexInRound === 0) {
      rounds.push({
        dayOfMonth: slot.dayOfMonth,
        roundNumber: slot.roundNumber,
        scheduledAtIso: slot.scheduledAtIso,
      });
    }
  }
  return rounds;
}

/**
 * Genera un calendario completo de ida y vuelta (Berger / Circle Method) para un
 * número par de equipos (30 equipos -> 29 jornadas de ida + 29 de vuelta = 58).
 * Reparte los partidos de cada jornada equitativamente entre `startHour` y `endHour`.
 */
export function generateDoubleRoundRobinFixtures(params: {
  readonly teamIds: readonly string[];
  readonly year: number;
  readonly month: number;
  readonly startHour?: number;
  readonly endHour?: number;
  readonly timeZone?: string;
}): readonly ScheduledFixture[] {
  const { teamIds, year, month, startHour, endHour, timeZone } = params;
  const n = teamIds.length;
  if (n < 2 || n % 2 !== 0) {
    throw new Error(`El calendario requiere un número par de equipos (recibido: ${String(n)})`);
  }

  const roundsPerLeg = n - 1;
  const totalRoundsExpected = roundsPerLeg * 2;
  const matchesPerRound = n / 2;
  const matchSlots = distributeMatchSlotsAcrossMonth({
    year,
    month,
    ...(startHour !== undefined ? { startHour } : {}),
    ...(endHour !== undefined ? { endHour } : {}),
    matchesPerRound,
    ...(timeZone ? { timeZone } : {}),
  });

  const roundCount = matchSlots.reduce((acc, s) => Math.max(acc, s.roundNumber), 0);
  if (n === 30 && roundCount !== 58) {
    throw new Error(`Se esperaban 58 jornadas para 30 equipos, generadas: ${String(roundCount)}`);
  }

  const slotMap = new Map<string, ScheduledMatchSlot>(
    matchSlots.map((slot) => [
      `${String(slot.roundNumber)}:${String(slot.matchIndexInRound)}`,
      slot,
    ]),
  );

  const fixed = teamIds[0];
  if (!fixed) {
    throw new Error('Lista de equipos vacía');
  }
  const rotating = teamIds.slice(1);
  const firstLegRounds: { home: string; away: string }[][] = [];

  for (let r = 0; r < roundsPerLeg; r += 1) {
    const pairs: { home: string; away: string }[] = [];
    const last = rotating[rotating.length - 1];
    if (!last) {
      throw new Error('Error interno al rotar equipos');
    }

    // Alternamos localía del equipo fijo para equilibrar local/visitante
    if (r % 2 === 0) {
      pairs.push({ home: fixed, away: last });
    } else {
      pairs.push({ home: last, away: fixed });
    }

    const half = (rotating.length - 1) / 2;
    for (let i = 0; i < half; i += 1) {
      const t1 = rotating[i];
      const t2 = rotating[rotating.length - 2 - i];
      if (!t1 || !t2) {
        continue;
      }
      if ((i + r) % 2 === 0) {
        pairs.push({ home: t1, away: t2 });
      } else {
        pairs.push({ home: t2, away: t1 });
      }
    }

    firstLegRounds.push(pairs);

    // Rotación horaria: el último pasa a la posición 0 de rotating
    rotating.pop();
    rotating.unshift(last);
  }

  const fixtures: ScheduledFixture[] = [];
  for (let roundIdx = 0; roundIdx < Math.min(totalRoundsExpected, roundCount); roundIdx += 1) {
    const roundNumber = roundIdx + 1;
    const isSecondLeg = roundIdx >= roundsPerLeg;
    const baseRound = firstLegRounds[isSecondLeg ? roundIdx - roundsPerLeg : roundIdx];
    if (!baseRound) {
      continue;
    }

    for (let mIdx = 0; mIdx < baseRound.length; mIdx += 1) {
      const pair = baseRound[mIdx];
      const slot = slotMap.get(`${String(roundNumber)}:${String(mIdx)}`);
      if (!pair || !slot) {
        continue;
      }
      const homeTeamId = isSecondLeg ? pair.away : pair.home;
      const awayTeamId = isSecondLeg ? pair.home : pair.away;

      fixtures.push({
        roundNumber,
        matchIndexInRound: mIdx,
        homeTeamId,
        awayTeamId,
        scheduledAtIso: slot.scheduledAtIso,
      });
    }
  }

  return fixtures;
}
