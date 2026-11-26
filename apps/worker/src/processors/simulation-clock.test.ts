import { describe, expect, it } from 'vitest';

import { computeNextLeagueClock } from './simulation-clock.js';

describe('computeNextLeagueClock', () => {
  const seasonStart = new Date('2026-11-01T07:30:00.000Z');

  it('sincroniza 1:1 con el reloj del servidor cuando la liga opera en tiempo real 24/7', () => {
    const prevTick = Date.parse('2026-11-17T20:50:00.000Z');
    const now = Date.parse('2026-11-17T20:50:05.000Z');
    const next = computeNextLeagueClock({
      currentGameClockAt: new Date(prevTick - 1_200),
      seasonStartedAt: seasonStart,
      isAccelerated: false,
      prevWallMs: prevTick,
      nowMs: now,
    });
    expect(next.toISOString()).toBe('2026-11-17T20:50:05.000Z');
  });

  it('recupera horas tras apagado o reposo del PC si la liga ya estaba sincronizada en curso', () => {
    const overnightLeagueClock = new Date('2026-11-17T21:00:00.000Z');
    const morningNow = Date.parse('2026-11-18T09:15:00.000Z');
    const next = computeNextLeagueClock({
      currentGameClockAt: overnightLeagueClock,
      seasonStartedAt: seasonStart,
      isAccelerated: false,
      nowMs: morningNow,
    });
    expect(next.toISOString()).toBe('2026-11-18T09:15:00.000Z');
  });

  it('no retrocede si una temporada nueva empieza en el mes siguiente futuro', () => {
    const decStart = new Date('2026-12-01T07:30:00.000Z');
    const novEnd = Date.parse('2026-11-30T19:00:00.000Z');
    const next = computeNextLeagueClock({
      currentGameClockAt: decStart,
      seasonStartedAt: decStart,
      isAccelerated: false,
      prevWallMs: novEnd - 5_000,
      nowMs: novEnd,
    });
    expect(next.toISOString()).toBe('2026-12-01T07:30:00.000Z');
  });

  it('mantiene avance 1x limpio en modo acelerado usando el delta entre ticks reales', () => {
    const acceleratedClock = new Date('2026-11-22T12:00:00.000Z');
    const prevTick = Date.parse('2026-11-17T20:50:00.000Z');
    const now = prevTick + 5_000;
    const next = computeNextLeagueClock({
      currentGameClockAt: acceleratedClock,
      seasonStartedAt: seasonStart,
      isAccelerated: true,
      prevWallMs: prevTick,
      nowMs: now,
    });
    expect(next.toISOString()).toBe('2026-11-22T12:00:05.000Z');
  });
});
