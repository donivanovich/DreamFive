import { describe, expect, it } from 'vitest';

import {
  formatCleanDecimal,
  localizeDisciplineReason,
  localizeTransferResponseNote,
} from './index.js';

describe('localizeDisciplineReason', () => {
  it('translates legacy Spanish injury notes cleanly to English and vice versa', () => {
    expect(localizeDisciplineReason('Contusión en rodilla (2 jorn.)', 'en')).toBe(
      'Knee contusion (2 games)',
    );
    expect(localizeDisciplineReason('Sobrecarga muscular (1 jorn.)', 'en')).toBe(
      'Muscle strain (1 game)',
    );
    expect(localizeDisciplineReason('Contusión en rodilla (2 jorn.)', 'es')).toBe(
      'Contusión en rodilla (2 partidos)',
    );
    expect(localizeDisciplineReason('Knee contusion (2 games)', 'es')).toBe(
      'Contusión en rodilla (2 partidos)',
    );
    expect(localizeDisciplineReason('Molestias leves post-partido (duda)', 'en')).toBe(
      'Minor post-game soreness (questionable)',
    );
    expect(
      localizeDisciplineReason('Expulsión por doble técnica / falta flagrante (1 jorn.)', 'en'),
    ).toBe('Ejection for double technical / flagrant foul (1 game)');
  });
});

describe('localizeTransferResponseNote', () => {
  it('translates stored Spanish CPU trade messages into English cleanly', () => {
    expect(
      localizeTransferResponseNote(
        '¡Enhorabuena! Los Atlanta Falcons han aceptado tu oferta por Cole Davis.',
        'en',
      ),
    ).toBe('Congratulations! The Atlanta Falcons accepted your offer for Cole Davis.');
    expect(
      localizeTransferResponseNote(
        'Los Denver Lingots te proponen un intercambio equilibrado.',
        'en',
      ),
    ).toBe('The Denver Lingots sent you a balanced trade proposal.');
  });
});

describe('formatCleanDecimal', () => {
  it('omits trailing .0 for whole values and keeps meaningful decimals', () => {
    expect(formatCleanDecimal(1023.0)).toBe('1023');
    expect(formatCleanDecimal(1023.04)).toBe('1023');
    expect(formatCleanDecimal(1023.5)).toBe('1023.5');
    expect(formatCleanDecimal(0.0)).toBe('0');
    expect(formatCleanDecimal(-0.02)).toBe('0');
    expect(formatCleanDecimal(-3.0)).toBe('-3');
    expect(formatCleanDecimal(75.2, 2)).toBe('75.2');
    expect(formatCleanDecimal(75.25, 2)).toBe('75.25');
  });
});
