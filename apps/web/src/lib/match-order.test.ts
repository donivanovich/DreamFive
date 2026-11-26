import { describe, expect, it } from 'vitest';

import { shouldShowHomeFirst } from './match-order';

describe('shouldShowHomeFirst', () => {
  it('es determinista para el mismo id de partido', () => {
    expect(shouldShowHomeFirst('match-abc-123')).toBe(shouldShowHomeFirst('match-abc-123'));
  });

  it('alterna el orden entre local primero y visitante primero entre partidos', () => {
    const sampleIds = [
      'match-1',
      'match-2',
      'match-3',
      'match-4',
      'match-5',
      'match-6',
      'match-7',
      'match-8',
    ];
    const results = sampleIds.map((id) => shouldShowHomeFirst(id));

    expect(results).toContain(true);
    expect(results).toContain(false);
  });
});
