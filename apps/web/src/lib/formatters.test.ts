import { describe, expect, it } from 'vitest';

import {
  formatDeltaMillions,
  formatLocaleDecimal,
  formatMillions,
  formatStatNumber,
} from './formatters';

describe('number formatters', () => {
  it('omits trailing .0 from whole stat numbers and keeps real decimals', () => {
    expect(formatStatNumber(1023.0)).toBe('1023');
    expect(formatStatNumber(1023.4)).toBe('1023.4');
    expect(formatStatNumber(0.0)).toBe('0');
    expect(formatStatNumber(-2.0)).toBe('-2');
    expect(formatStatNumber(-2.5)).toBe('-2.5');
    expect(formatLocaleDecimal(1023.0, 'es-ES')).toBe('1023');
    expect(formatLocaleDecimal(1023.0, 'en-US')).toBe('1,023');
  });

  it('formats millions and market deltas without trailing .0', () => {
    expect(formatMillions(75.0)).toBe('75M');
    expect(formatMillions(75.5)).toBe('75.5M');
    expect(formatMillions(75.25)).toBe('75.25M');
    expect(formatDeltaMillions(0)).toBe('0M');
    expect(formatDeltaMillions(3.0)).toBe('+3M');
    expect(formatDeltaMillions(3.6)).toBe('+3.6M');
    expect(formatDeltaMillions(-3.0)).toBe('-3M');
  });
});
