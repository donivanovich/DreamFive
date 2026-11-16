import { describe, expect, it } from 'vitest';

import {
  advanceUnavailableStatusOneRound,
  buildDailyRoundCounts,
  calculatePlayerFantasyPoints,
  createSeededRng,
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
  reb: 1.2,
  ast: 1.5,
  stl: 2.5,
  blk: 2.5,
  tov: -1.5,
  pf: -0.5,
  min: 0,
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
    }
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

    // Puntuación configurable: cambiar multiplicadores cambia los puntos sin tocar el motor
    const customFp = calculatePlayerFantasyPoints(
      { pts: 20, reb: 5, ast: 4, stl: 2, blk: 1, tov: 2, pf: 3, minutes: 32 },
      { ...DEFAULT_WEIGHTS, pts: 2 },
    );
    expect(customFp).toBe(55);
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
        avgFantasyPoints: 26,
        gamesPlayed: 5,
      },
      teamAlreadyHasSuperstar: true,
      config: { evaluateEveryGames: 5, promoteMinFpDelta: 4.5, demoteMaxFpDelta: -4.5 },
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
          currentPriceMillions: 12,
          avgFantasyPoints: 34,
          lastRoundFantasyPoints: 40,
        },
        {
          playerId: 'p2',
          position: 'PG',
          role: 'BENCH',
          age: 33,
          status: 'INJURED',
          currentPriceMillions: 2,
          avgFantasyPoints: 7,
          lastRoundFantasyPoints: 0,
        },
      ],
      config: { sensitivity: 0.06, minPriceMillions: 0.5, maxPriceMillions: 45 },
    });
    expect(repriced[0]?.newPriceMillions).toBeGreaterThan(12);
    expect(repriced[1]?.newPriceMillions).toBeLessThan(2);
  });

  it('mantiene equilibrio de precios tras 58 jornadas reales de simulación evitando inflación masiva hacia 45M', () => {
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
        config: { sensitivity: 0.06, minPriceMillions: 0.5, maxPriceMillions: 45 },
      });

      for (const u of updates) {
        prices.set(u.playerId, u.newPriceMillions);
      }
    }

    const finalValues = [...prices.values()].sort((a, b) => a - b);
    const median = finalValues[Math.floor(finalValues.length / 2)] ?? 0;
    const nearCap = finalValues.filter((v) => v >= 40).length;
    const dropped = catalog.players.filter(
      (p) => (prices.get(p.slug) ?? p.basePriceMillions) < p.basePriceMillions - 0.5,
    ).length;
    const rose = catalog.players.filter(
      (p) => (prices.get(p.slug) ?? p.basePriceMillions) > p.basePriceMillions + 0.5,
    ).length;

    expect(median).toBeLessThan(12);
    expect(nearCap / finalValues.length).toBeLessThan(0.06);
    expect(dropped).toBeGreaterThan(80);
    expect(rose).toBeGreaterThan(50);
  });
});
