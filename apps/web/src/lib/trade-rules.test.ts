import { describe, expect, it } from 'vitest';

import type { Player, Position } from '@/types/fantasy';

import { evaluateTradeProposal } from './trade-rules';

function makePlayer(id: string, position: Position, priceMillions: number): Player {
  return {
    id,
    name: `Player ${id}`,
    initials: 'PL',
    position,
    role: 'Rotación',
    age: 24,
    teamId: 't1',
    teamAbbr: 'LAR',
    teamName: 'Los Angeles Rivers',
    priceMillions,
    priceDeltaMillions: 0,
    status: 'Healthy',
    stats: {
      pts: 10,
      reb: 4,
      ast: 3,
      stl: 1,
      blk: 0.4,
      tov: 1.5,
      pf: 2,
      min: 22,
      fpPerGame: 20,
      recentTrend: 'neutral',
    },
  };
}

function buildValidSquad(): Player[] {
  return [
    makePlayer('pg1', 'PG', 10),
    makePlayer('pg2', 'PG', 4),
    makePlayer('pg3', 'PG', 2),
    makePlayer('sg1', 'SG', 12),
    makePlayer('sg2', 'SG', 6),
    makePlayer('sg3', 'SG', 3),
    makePlayer('sg4', 'SG', 2),
    makePlayer('sf1', 'SF', 14),
    makePlayer('sf2', 'SF', 5),
    makePlayer('sf3', 'SF', 3),
    makePlayer('pf1', 'PF', 9),
    makePlayer('pf2', 'PF', 6),
    makePlayer('pf3', 'PF', 4),
    makePlayer('pf4', 'PF', 2),
    makePlayer('c1', 'C', 11),
    makePlayer('c2', 'C', 5),
    makePlayer('c3', 'C', 3),
    makePlayer('c4', 'C', 2),
  ];
}

describe('evaluateTradeProposal', () => {
  it('acepta intercambio entre posiciones distintas que cumple 18 jugadores, 5 posiciones y >= 50%', () => {
    const roster = buildValidSquad();
    const target = makePlayer('ext1', 'C', 5);
    const result = evaluateTradeProposal({
      currentRoster: roster,
      offeredPlayerIds: ['sg4'],
      requestedPlayers: [target],
      cashOfferedMillions: 0.5,
    });

    expect(result.meetsValueRule).toBe(true);
    expect(result.meetsSquadSizeRule).toBe(true);
    expect(result.meetsPositionCoverageRule).toBe(true);
    expect(result.isValid).toBe(true);
  });

  it('rechaza intercambio por debajo del 50 % del valor deseado', () => {
    const roster = buildValidSquad();
    const target = makePlayer('ext1', 'SF', 10);
    const result = evaluateTradeProposal({
      currentRoster: roster,
      offeredPlayerIds: ['pg2'],
      requestedPlayers: [target],
      cashOfferedMillions: 0,
    });

    expect(result.meetsValueRule).toBe(false);
    expect(result.isValid).toBe(false);
  });

  it('rechaza intercambio si rompe el tamaño de 18 jugadores o deja una posición vacía', () => {
    const base = buildValidSquad();
    const onlyOneCenter = base.filter((p) => p.id !== 'c2' && p.id !== 'c3' && p.id !== 'c4');
    onlyOneCenter.push(
      makePlayer('pg4', 'PG', 2),
      makePlayer('pg5', 'PG', 2),
      makePlayer('pg6', 'PG', 2),
    );
    const target = makePlayer('ext2', 'PG', 10);

    const result = evaluateTradeProposal({
      currentRoster: onlyOneCenter,
      offeredPlayerIds: ['c1'],
      requestedPlayers: [target],
      cashOfferedMillions: 0,
    });

    expect(result.missingPositions).toEqual(['C']);
    expect(result.meetsPositionCoverageRule).toBe(false);
    expect(result.isValid).toBe(false);
  });
});
