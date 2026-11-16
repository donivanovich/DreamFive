import { describe, expect, it } from 'vitest';

import { localizeDisciplineReason, localizeTransferResponseNote } from './index.js';

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
