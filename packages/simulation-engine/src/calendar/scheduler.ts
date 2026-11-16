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
 * Asigna las 58 jornadas a fechas/horas reales escalonadas entre startHour (08:00)
 * y endHour (20:00) UTC en el mes natural indicado.
 */
export function distributeRoundsAcrossMonth(params: {
  readonly year: number;
  readonly month: number;
  readonly startHour?: number;
  readonly endHour?: number;
}): readonly RoundCalendarDay[] {
  const { year, month, startHour = 8, endHour = 20 } = params;
  const daysInMonth = getDaysInCalendarMonth(year, month);
  const dailyCounts = buildDailyRoundCounts(daysInMonth);
  const result: RoundCalendarDay[] = [];
  let roundNumber = 1;

  for (let dayIdx = 0; dayIdx < dailyCounts.length; dayIdx += 1) {
    const dayOfMonth = dayIdx + 1;
    const count = dailyCounts[dayIdx] ?? 2;

    const hoursForCount =
      count === 1
        ? [(startHour + endHour) / 2]
        : count === 2
          ? [startHour + 1, endHour - 2]
          : [startHour, Math.round((startHour + endHour) / 2), endHour - 1];

    for (const hour of hoursForCount) {
      const wholeHour = Math.floor(hour);
      const minutes = Math.round((hour - wholeHour) * 60);
      const scheduledAt = new Date(Date.UTC(year, month - 1, dayOfMonth, wholeHour, minutes, 0, 0));
      result.push({
        dayOfMonth,
        roundNumber,
        scheduledAtIso: scheduledAt.toISOString(),
      });
      roundNumber += 1;
    }
  }

  return result;
}

/**
 * Genera un calendario completo de ida y vuelta (Berger / Circle Method) para un
 * número par de equipos (30 equipos -> 29 jornadas de ida + 29 de vuelta = 58).
 * Garantiza:
 * - Ningún equipo juega más de una vez en una misma jornada.
 * - No se repite emparejamiento dentro de la primera vuelta (435 cruces únicos).
 * - La segunda vuelta invierte local y visitante respecto a la primera.
 */
export function generateDoubleRoundRobinFixtures(params: {
  readonly teamIds: readonly string[];
  readonly year: number;
  readonly month: number;
  readonly startHour?: number;
  readonly endHour?: number;
}): readonly ScheduledFixture[] {
  const { teamIds, year, month, startHour, endHour } = params;
  const n = teamIds.length;
  if (n < 2 || n % 2 !== 0) {
    throw new Error(`El calendario requiere un número par de equipos (recibido: ${String(n)})`);
  }

  const roundsPerLeg = n - 1;
  const totalRoundsExpected = roundsPerLeg * 2;
  const roundDates = distributeRoundsAcrossMonth({
    year,
    month,
    ...(startHour !== undefined ? { startHour } : {}),
    ...(endHour !== undefined ? { endHour } : {}),
  });

  if (n === 30 && roundDates.length !== 58) {
    throw new Error(
      `Se esperaban 58 jornadas para 30 equipos, generadas: ${String(roundDates.length)}`,
    );
  }

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
  for (
    let roundIdx = 0;
    roundIdx < Math.min(totalRoundsExpected, roundDates.length);
    roundIdx += 1
  ) {
    const isSecondLeg = roundIdx >= roundsPerLeg;
    const baseRound = firstLegRounds[isSecondLeg ? roundIdx - roundsPerLeg : roundIdx];
    const calendarDay = roundDates[roundIdx];
    if (!baseRound || !calendarDay) {
      continue;
    }

    const baseDateMs = Date.parse(calendarDay.scheduledAtIso);

    for (let mIdx = 0; mIdx < baseRound.length; mIdx += 1) {
      const pair = baseRound[mIdx];
      if (!pair) {
        continue;
      }
      const homeTeamId = isSecondLeg ? pair.away : pair.home;
      const awayTeamId = isSecondLeg ? pair.home : pair.away;
      // Pequeño escalonamiento dentro de la franja horaria (sin salir de 08:00-20:00)
      const staggeredAt = new Date(baseDateMs + mIdx * 2 * 60_000).toISOString();

      fixtures.push({
        roundNumber: calendarDay.roundNumber,
        matchIndexInRound: mIdx,
        homeTeamId,
        awayTeamId,
        scheduledAtIso: staggeredAt,
      });
    }
  }

  return fixtures;
}
