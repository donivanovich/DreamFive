import { describe, expect, it } from 'vitest';

import {
  advanceUnavailableStatusOneRound,
  buildDailyRoundCounts,
  calculatePlayerDreamPointsBreakdown,
  calculatePlayerFantasyPoints,
  createSeededRng,
  distributeMatchSlotsAcrossMonth,
  distributeRoundsAcrossMonth,
  evaluatePlayerProgression,
  generateDoubleRoundRobinFixtures,
  generateInitialUniverseCatalog,
  getDaysInCalendarMonth,
  recalculateMarketPrices,
  simulateBasketballMatch,
} from './index.js';
import type { EnginePlayerInput, EnginePosition, EngineScoringWeights } from './shared/types.js';

const DEFAULT_WEIGHTS: EngineScoringWeights = {
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
  ptsDivisor: 5,
  rebDivisor: 2,
  astDivisor: 2,
  minDivisor: 10,
  minMaxPoints: 4,
  minMaxMinutes: 48,
};

const DEFAULT_INJURY_CONFIG = {
  baseInjuryChancePerGame: 0.014,
  questionableChancePerGame: 0.02,
  injuryDurationGamesMin: 1,
  injuryDurationGamesMax: 4,
  ejectionChanceByRole: {
    SUPERSTAR: 0.011,
    STAR: 0.009,
    STARTER: 0.007,
    ROTATION: 0.007,
    ROOKIE: 0.013,
    BENCH: 0.004,
  },
};

describe('generateInitialUniverseCatalog', () => {
  it('genera 30 equipos, 540 jugadores, distribución 1/2/2/5/3/5 y 5 posiciones por equipo', () => {
    const catalog = generateInitialUniverseCatalog('test-seed-1');
    expect(catalog.teams).toHaveLength(30);
    expect(catalog.players).toHaveLength(540);

    for (const team of catalog.teams) {
      const roster = catalog.players.filter((p) => p.templateTeamCode === team.code);
      expect(roster).toHaveLength(18);

      expect(roster.filter((p) => p.initialRole === 'SUPERSTAR')).toHaveLength(1);
      expect(roster.filter((p) => p.initialRole === 'STAR')).toHaveLength(2);
      expect(roster.filter((p) => p.initialRole === 'STARTER')).toHaveLength(2);
      expect(roster.filter((p) => p.initialRole === 'ROTATION')).toHaveLength(5);
      expect(roster.filter((p) => p.initialRole === 'ROOKIE')).toHaveLength(3);
      expect(roster.filter((p) => p.initialRole === 'BENCH')).toHaveLength(5);

      const positions = new Set<EnginePosition>(roster.map((p) => p.position));
      expect(positions.size).toBe(5);
    }

    const catalogAgain = generateInitialUniverseCatalog('test-seed-1');
    expect(catalogAgain.players[0]?.fullName).toBe(catalog.players[0]?.fullName);
  });
});

describe('calendario mensual de 58 jornadas ida y vuelta (30 equipos)', () => {
  it('distribuye exactamente 58 jornadas en meses de 28, 29 (bisiesto), 30 y 31 días entre 08:00 y 20:00', () => {
    const cases = [
      { year: 2026, month: 2, expectedDays: 28 },
      { year: 2028, month: 2, expectedDays: 29 },
      { year: 2026, month: 4, expectedDays: 30 },
      { year: 2026, month: 3, expectedDays: 31 },
    ];

    for (const c of cases) {
      const days = getDaysInCalendarMonth(c.year, c.month);
      expect(days).toBe(c.expectedDays);

      const counts = buildDailyRoundCounts(days);
      expect(counts.reduce((sum, v) => sum + v, 0)).toBe(58);

      const rounds = distributeRoundsAcrossMonth({
        year: c.year,
        month: c.month,
        startHour: 8,
        endHour: 20,
      });
      expect(rounds).toHaveLength(58);
      for (const round of rounds) {
        const hour = new Date(round.scheduledAtIso).getUTCHours();
        expect(hour).toBeGreaterThanOrEqual(8);
        expect(hour).toBeLessThanOrEqual(20);
      }

      const slots = distributeMatchSlotsAcrossMonth({
        year: c.year,
        month: c.month,
        startHour: 8,
        endHour: 20,
        matchesPerRound: 15,
      });
      expect(slots).toHaveLength(58 * 15);
      for (let day = 1; day <= days; day += 1) {
        const daySlots = slots.filter((s) => s.dayOfMonth === day);
        const firstMs = Date.parse(daySlots[0]?.scheduledAtIso ?? '');
        const lastMs = Date.parse(daySlots[daySlots.length - 1]?.scheduledAtIso ?? '');
        expect(new Date(firstMs).getUTCHours()).toBe(8);
        expect(new Date(firstMs).getUTCMinutes()).toBe(0);
        expect(new Date(lastMs).getUTCHours()).toBe(20);
        expect(new Date(lastMs).getUTCMinutes()).toBe(0);
        for (let i = 1; i < daySlots.length; i += 1) {
          const gapMinutes =
            (Date.parse(daySlots[i]?.scheduledAtIso ?? '') -
              Date.parse(daySlots[i - 1]?.scheduledAtIso ?? '')) /
            60_000;
          expect(gapMinutes).toBeGreaterThanOrEqual(15);
        }
      }
    }
  });

  it('reparte los partidos equitativamente entre 08:00 y 20:00 en zona horaria local (Europe/Madrid)', () => {
    const teamIds = Array.from({ length: 30 }, (_, i) => `team-${String(i + 1)}`);
    const fixtures = generateDoubleRoundRobinFixtures({
      teamIds,
      year: 2026,
      month: 11,
      startHour: 8,
      endHour: 20,
      timeZone: 'Europe/Madrid',
    });
    const round34 = fixtures.filter((f) => f.roundNumber === 34);
    const round35 = fixtures.filter((f) => f.roundNumber === 35);
    const fmt = (iso: string) =>
      new Intl.DateTimeFormat('es-ES', {
        timeZone: 'Europe/Madrid',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(new Date(iso));

    expect(fmt(round34[0]?.scheduledAtIso ?? '')).toBe('08:00');
    expect(fmt(round35[round35.length - 1]?.scheduledAtIso ?? '')).toBe('20:00');
    expect(Date.parse(round34[14]?.scheduledAtIso ?? '')).toBeLessThan(
      Date.parse(round35[0]?.scheduledAtIso ?? ''),
    );
  });

  it('genera 870 partidos sin duplicados en primera vuelta y con local/visitante invertidos en segunda vuelta', () => {
    const teamIds = Array.from({ length: 30 }, (_, i) => `team-${String(i + 1)}`);
    const fixtures = generateDoubleRoundRobinFixtures({
      teamIds,
      year: 2026,
      month: 11,
      startHour: 8,
      endHour: 20,
    });

    expect(fixtures).toHaveLength(870);

    const firstLegPairs = new Set<string>();
    const secondLegDirected = new Set<string>();
    const firstLegDirected = new Set<string>();

    for (let round = 1; round <= 58; round += 1) {
      const roundMatches = fixtures.filter((f) => f.roundNumber === round);
      expect(roundMatches).toHaveLength(15);

      const teamsSeen = new Set<string>();
      for (const m of roundMatches) {
        expect(m.homeTeamId).not.toBe(m.awayTeamId);
        teamsSeen.add(m.homeTeamId);
        teamsSeen.add(m.awayTeamId);

        const unordered = [m.homeTeamId, m.awayTeamId].sort().join('::');
        const directed = `${m.homeTeamId}->${m.awayTeamId}`;
        if (round <= 29) {
          expect(firstLegPairs.has(unordered)).toBe(false);
          firstLegPairs.add(unordered);
          firstLegDirected.add(directed);
        } else {
          secondLegDirected.add(directed);
        }
      }
      expect(teamsSeen.size).toBe(30);
    }

    expect(firstLegPairs.size).toBe(435);
    expect(secondLegDirected.size).toBe(435);
    for (const pair of firstLegDirected) {
      const [h, a] = pair.split('->');
      expect(secondLegDirected.has(`${a ?? ''}->${h ?? ''}`)).toBe(true);
    }
  });
});

describe('simulación de partidos, puntuación configurable, bajas y economía', () => {
  it('simula de forma determinista por semilla, nunca empata, respeta bajas y suma puntos exactos', () => {
    const catalog = generateInitialUniverseCatalog('sim-test-catalog');
    const buildTeam = (code: string, teamId: string) => ({
      id: teamId,
      name: `Team ${code}`,
      code,
      roster: catalog.players
        .filter((p) => p.templateTeamCode === code)
        .map<EnginePlayerInput>((p, idx) => ({
          id: `${code}-${String(idx)}`,
          name: p.fullName,
          position: p.position,
          role: p.initialRole,
          age: p.age,
          status: idx === 0 ? 'INJURED' : idx === 1 ? 'SUSPENDED' : 'HEALTHY',
          overallRating: p.overallRating,
          offense: p.offense,
          defense: p.defense,
          playmaking: p.playmaking,
          rebounding: p.rebounding,
          athleticism: p.athleticism,
          iq: p.iq,
          priceMillions: p.basePriceMillions,
        })),
    });

    const home = buildTeam('LAR', 'home-1');
    const away = buildTeam('LAG', 'away-1');

    const resultA = simulateBasketballMatch({
      homeTeam: home,
      awayTeam: away,
      seed: 'match-seed-42',
      scoringWeights: DEFAULT_WEIGHTS,
      injuryConfig: DEFAULT_INJURY_CONFIG,
    });
    const resultB = simulateBasketballMatch({
      homeTeam: home,
      awayTeam: away,
      seed: 'match-seed-42',
      scoringWeights: DEFAULT_WEIGHTS,
      injuryConfig: DEFAULT_INJURY_CONFIG,
    });

    expect(resultA.homeScore).toBe(resultB.homeScore);
    expect(resultA.awayScore).toBe(resultB.awayScore);
    expect(resultA.homeScore).not.toBe(resultA.awayScore);
    expect(resultA.homeScore).toBe(resultA.homeTotals.pts);
    expect(resultA.awayScore).toBe(resultA.awayTotals.pts);

    // Jugadores lesionados o sancionados previos al partido no juegan minutos
    expect(resultA.playerBoxes.find((b) => b.playerId === 'LAR-0')?.minutes).toBe(0);
    expect(resultA.playerBoxes.find((b) => b.playerId === 'LAR-1')?.minutes).toBe(0);

    // Máximo 48 min y cumplimiento estricto de límites de descalificación en partido
    for (const box of resultA.playerBoxes) {
      expect(box.minutes).toBeLessThanOrEqual(48);
      expect(box.pf).toBeLessThanOrEqual(6);
      expect(box.tf).toBeLessThanOrEqual(2);
      expect(box.ft1).toBeLessThanOrEqual(2);
      expect(box.ft2).toBeLessThanOrEqual(1);
      const reachedDqLimit = box.pf >= 6 || box.tf >= 2 || box.ft1 >= 2 || box.ft2 >= 1;
      expect(box.disqualified).toBe(reachedDqLimit);
      expect(box.ejected).toBe(reachedDqLimit);
      if (reachedDqLimit && !box.injured) {
        // La descalificación se aplica únicamente al partido actual
        expect(box.nextStatus).toBe('HEALTHY');
        expect(box.nextGamesOut).toBe(0);
      }
    }

    // Reglas NBA exactas: truncado decimal, tope MIN 4 pts/48m, TD +4 una sola vez y negativos
    const standardLine = calculatePlayerDreamPointsBreakdown(
      { pts: 24, reb: 9, ast: 7, stl: 2, blk: 1, tov: 3, pf: 4, minutes: 39 },
      DEFAULT_WEIGHTS,
    );
    // MIN floor(39/10)=3, PTS floor(24/5)=4, REB floor(9/2)=4, AST floor(7/2)=3, STL=2, BLK=1, TD=0, TOV=-3, PF=-4 => 10
    expect(standardLine.minutes).toBe(3);
    expect(standardLine.pts).toBe(4);
    expect(standardLine.reb).toBe(4);
    expect(standardLine.ast).toBe(3);
    expect(standardLine.td).toBe(0);
    expect(standardLine.total).toBe(10);

    // Triple-doble y cuádruple-doble otorgan +4 una sola vez; >=48m topa en 4 pts MIN
    const quadDoubleLine = calculatePlayerDreamPointsBreakdown(
      { pts: 25, reb: 10, ast: 11, stl: 10, blk: 2, tov: 1, pf: 2, minutes: 53 },
      DEFAULT_WEIGHTS,
    );
    // MIN=4, PTS=5, REB=5, AST=5, STL=10, BLK=2, TD=4, TOV=-1, PF=-2 => 32
    expect(quadDoubleLine.minutes).toBe(4);
    expect(quadDoubleLine.tdCount).toBe(1);
    expect(quadDoubleLine.td).toBe(4);
    expect(quadDoubleLine.total).toBe(32);

    // Penalizaciones negativas (TF -2, FT1 -3, FT2 -5) pueden dejar el total en negativo
    const negativeTotal = calculatePlayerFantasyPoints(
      { pts: 4, reb: 1, ast: 1, stl: 0, blk: 0, tov: 2, pf: 1, tf: 2, ft1: 1, ft2: 1, minutes: 9 },
      DEFAULT_WEIGHTS,
    );
    // 0 positives; -2 (TOV) -1 (PF) -4 (TF) -3 (FT1) -5 (FT2) = -15
    expect(negativeTotal).toBe(-15);
  });

  it('recupera bajas por jornada, evalúa progresión y recalcula mercado sin salirse de límites', () => {
    const step = advanceUnavailableStatusOneRound({
      currentStatus: 'INJURED',
      gamesOutRemaining: 1,
      statusNote: 'Esguince',
    });
    expect(step.nextStatus).toBe('HEALTHY');
    expect(step.nextGamesOut).toBe(0);

    const prog = evaluatePlayerProgression({
      input: {
        age: 21,
        role: 'ROOKIE',
        overallRating: 72,
        avgFantasyPoints: 5,
        gamesPlayed: 5,
      },
      teamAlreadyHasSuperstar: true,
      config: { evaluateEveryGames: 5, promoteMinFpDelta: 2.5, demoteMaxFpDelta: -2.5 },
      rng: createSeededRng('prog-seed'),
    });
    expect(prog.newOverallRating).toBeGreaterThanOrEqual(48);

    const repriced = recalculateMarketPrices({
      players: [
        {
          playerId: 'p1',
          position: 'PG',
          role: 'STAR',
          age: 23,
          status: 'HEALTHY',
          currentPriceMillions: 36,
          avgFantasyPoints: 11,
          lastRoundFantasyPoints: 14,
        },
        {
          playerId: 'p2',
          position: 'PG',
          role: 'BENCH',
          age: 33,
          status: 'INJURED',
          currentPriceMillions: 6,
          avgFantasyPoints: 0.5,
          lastRoundFantasyPoints: -2,
        },
      ],
      config: { sensitivity: 0.06, minPriceMillions: 1.5, maxPriceMillions: 135 },
    });
    expect(repriced[0]?.newPriceMillions).toBeGreaterThan(36);
    expect(repriced[1]?.newPriceMillions).toBeLessThan(6);
    // Verifica que subidas y bajadas mantienen proporción x3 real
    expect((repriced[0]?.deltaMillions ?? 0) >= 1.5).toBe(true);
    expect((repriced[1]?.deltaMillions ?? 0) <= -0.3).toBe(true);
  });

  it('mantiene equilibrio de precios x3 y marcadores NBA realistas tras 58 jornadas reales de simulación', () => {
    const catalog = generateInitialUniverseCatalog('balance-market-58');
    expect(catalog.teams).toHaveLength(30);
    expect(catalog.teams.map((t) => t.name)).toContain('Los Angeles Rivers');
    expect(catalog.teams.map((t) => t.name)).toContain('Sacramento Emperors');

    const fixtures = generateDoubleRoundRobinFixtures({
      teamIds: catalog.teams.map((t) => t.code),
      year: 2026,
      month: 11,
      startHour: 8,
      endHour: 20,
    });

    const playersByTeam = new Map<string, typeof catalog.players>();
    for (const t of catalog.teams) {
      playersByTeam.set(
        t.code,
        catalog.players.filter((p) => p.templateTeamCode === t.code),
      );
    }

    const prices = new Map<string, number>();
    const totalFp = new Map<string, number>();
    const gamesCount = new Map<string, number>();
    for (const p of catalog.players) {
      prices.set(p.slug, p.basePriceMillions);
      totalFp.set(p.slug, 0);
      gamesCount.set(p.slug, 0);
    }

    const teamScores: number[] = [];
    const regTeamScores: number[] = [];
    for (let round = 1; round <= 58; round++) {
      const lastRoundFp = new Map<string, number>();
      const roundMatches = fixtures.filter((f) => f.roundNumber === round);

      for (const m of roundMatches) {
        const homePlayers = playersByTeam.get(m.homeTeamId) ?? [];
        const awayPlayers = playersByTeam.get(m.awayTeamId) ?? [];
        const mapTeam = (teamId: string, roster: typeof catalog.players) => ({
          id: teamId,
          name: `Team ${teamId}`,
          code: teamId,
          roster: roster.map<EnginePlayerInput>((p) => ({
            id: p.slug,
            name: p.fullName,
            position: p.position,
            role: p.initialRole,
            age: p.age,
            status: 'HEALTHY',
            overallRating: p.overallRating,
            offense: p.offense,
            defense: p.defense,
            playmaking: p.playmaking,
            rebounding: p.rebounding,
            athleticism: p.athleticism,
            iq: p.iq,
            priceMillions: prices.get(p.slug) ?? p.basePriceMillions,
          })),
        });

        const sim = simulateBasketballMatch({
          homeTeam: mapTeam(m.homeTeamId, homePlayers),
          awayTeam: mapTeam(m.awayTeamId, awayPlayers),
          seed: `bal-r${String(round)}-${m.homeTeamId}-${m.awayTeamId}`,
          scoringWeights: DEFAULT_WEIGHTS,
          injuryConfig: DEFAULT_INJURY_CONFIG,
        });
        teamScores.push(sim.homeScore, sim.awayScore);
        if (sim.overtimeCount === 0) {
          regTeamScores.push(sim.homeScore, sim.awayScore);
        }

        for (const box of sim.playerBoxes) {
          lastRoundFp.set(box.playerId, box.fantasyPoints);
          totalFp.set(box.playerId, (totalFp.get(box.playerId) ?? 0) + box.fantasyPoints);
          gamesCount.set(box.playerId, (gamesCount.get(box.playerId) ?? 0) + 1);
        }
      }

      const updates = recalculateMarketPrices({
        players: catalog.players.map((p) => {
          const games = Math.max(1, gamesCount.get(p.slug) ?? 1);
          return {
            playerId: p.slug,
            position: p.position,
            role: p.initialRole,
            age: p.age,
            status: 'HEALTHY',
            currentPriceMillions: prices.get(p.slug) ?? p.basePriceMillions,
            avgFantasyPoints: (totalFp.get(p.slug) ?? 0) / games,
            lastRoundFantasyPoints: lastRoundFp.get(p.slug) ?? null,
          };
        }),
        config: { sensitivity: 0.06, minPriceMillions: 1.5, maxPriceMillions: 135 },
      });

      for (const u of updates) {
        prices.set(u.playerId, u.newPriceMillions);
      }
    }

    const avgTeamScore = teamScores.reduce((acc, v) => acc + v, 0) / Math.max(1, teamScores.length);
    const maxRegTeamScore = Math.max(...regTeamScores);
    expect(avgTeamScore).toBeGreaterThanOrEqual(98);
    expect(avgTeamScore).toBeLessThanOrEqual(122);
    expect(maxRegTeamScore).toBeLessThanOrEqual(152);

    const finalValues = [...prices.values()].sort((a, b) => a - b);
    const median = finalValues[Math.floor(finalValues.length / 2)] ?? 0;
    const nearCap = finalValues.filter((v) => v >= 120).length;
    const dropped = catalog.players.filter(
      (p) => (prices.get(p.slug) ?? p.basePriceMillions) < p.basePriceMillions - 1.5,
    ).length;
    const rose = catalog.players.filter(
      (p) => (prices.get(p.slug) ?? p.basePriceMillions) > p.basePriceMillions + 1.5,
    ).length;

    expect(median).toBeLessThan(36);
    expect(nearCap / finalValues.length).toBeLessThan(0.06);
    expect(dropped).toBeGreaterThan(80);
    expect(rose).toBeGreaterThan(50);
  });

  it('detiene minutos y estadísticas al alcanzar cualquier límite de descalificación sin suspender siguientes partidos', () => {
    const catalog = generateInitialUniverseCatalog('dq-check-catalog');
    const buildTeam = (code: string, teamId: string) => ({
      id: teamId,
      name: `Team ${code}`,
      code,
      roster: catalog.players
        .filter((p) => p.templateTeamCode === code)
        .map<EnginePlayerInput>((p, idx) => ({
          id: `${code}-${String(idx)}`,
          name: p.fullName,
          position: p.position,
          role: p.initialRole,
          age: p.age,
          status: 'HEALTHY',
          overallRating: p.overallRating,
          offense: p.offense,
          defense: p.defense,
          playmaking: p.playmaking,
          rebounding: p.rebounding,
          athleticism: p.athleticism,
          iq: p.iq,
          priceMillions: p.basePriceMillions,
        })),
    });

    const home = buildTeam('LAR', 'h-dq');
    const away = buildTeam('LAG', 'a-dq');
    const dqReasonsSeen = new Set<string>();
    let negativeScoreSeen = false;

    for (let i = 0; i < 60; i += 1) {
      const sim = simulateBasketballMatch({
        homeTeam: home,
        awayTeam: away,
        seed: `dq-seed-${String(i)}`,
        scoringWeights: DEFAULT_WEIGHTS,
        injuryConfig: DEFAULT_INJURY_CONFIG,
      });

      for (const box of sim.playerBoxes) {
        if (box.fantasyPoints < 0) {
          negativeScoreSeen = true;
        }
        const computed = calculatePlayerDreamPointsBreakdown(
          {
            pts: box.pts,
            reb: box.reb,
            ast: box.ast,
            stl: box.stl,
            blk: box.blk,
            tov: box.tov,
            pf: box.pf,
            tf: box.tf,
            ft1: box.ft1,
            ft2: box.ft2,
            minutes: box.minutes,
          },
          DEFAULT_WEIGHTS,
        );
        expect(box.fantasyPoints).toBe(computed.total);
        expect(box.td).toBe(computed.tdCount);

        if (box.disqualified) {
          expect(box.ejected).toBe(true);
          expect(box.disqualificationReason).not.toBeNull();
          if (box.disqualificationReason) {
            dqReasonsSeen.add(box.disqualificationReason);
          }
          expect(box.pf === 6 || box.tf === 2 || box.ft1 === 2 || box.ft2 === 1).toBe(true);
          expect(box.minutes).toBeLessThanOrEqual(48);
          if (!box.injured) {
            expect(box.nextStatus).not.toBe('SUSPENDED');
            expect(box.nextGamesOut).toBe(0);
          }
        }
      }
    }

    expect(dqReasonsSeen.size).toBeGreaterThan(0);
    expect(negativeScoreSeen).toBe(true);
  });
});
