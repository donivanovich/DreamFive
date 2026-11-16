import { describe, expect, it } from 'vitest';

import { ALL_QUEUE_NAMES, QUEUE_NAMES } from './index.js';

describe('QUEUE_NAMES', () => {
  it('no contiene identificadores de cola duplicados', () => {
    expect(new Set(ALL_QUEUE_NAMES).size).toBe(Object.keys(QUEUE_NAMES).length);
  });
});
