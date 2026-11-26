import { formatCleanDecimal } from '@dream5/shared';

import type { AvailabilityStatus, PlayerRole, Position } from '@/types/fantasy';

export { formatCleanDecimal };

export const POSITION_LABELS: Record<Position, string> = {
  PG: 'Base',
  SG: 'Escolta',
  SF: 'Alero',
  PF: 'Ala-pívot',
  C: 'Pívot',
};

export const AVAILABILITY_LABELS: Record<AvailabilityStatus, string> = {
  Healthy: 'Disponible',
  Questionable: 'Duda',
  Injured: 'Lesionado',
  Suspended: 'Expulsado',
};

export const ROLE_SHORT_LABELS: Record<PlayerRole, string> = {
  Superestrella: 'Superestrella',
  Estrella: 'Estrella',
  Inicial: 'Inicial',
  Rotación: 'Rotación',
  Rookie: 'Rookie',
  Calientabanquillos: 'Banquillo',
};

export function formatStatNumber(value: number, maxDecimals = 1): string {
  return formatCleanDecimal(value, maxDecimals);
}

export function formatLocaleDecimal(value: number, locale: string, maxDecimals = 1): string {
  if (!Number.isFinite(value)) {
    return '0';
  }
  const factor = 10 ** maxDecimals;
  const rounded = Math.round(value * factor) / factor;
  const normalized = Object.is(rounded, -0) ? 0 : rounded;
  return normalized.toLocaleString(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDecimals,
  });
}

export function formatMillions(value: number): string {
  const scaledHundredths = Math.round(Math.abs(value) * 100);
  const maxDecimals = scaledHundredths % 10 !== 0 ? 2 : 1;
  return `${formatCleanDecimal(value, maxDecimals)}M`;
}

export function formatExactCreditsFromMillions(
  millions: number,
  locale = 'en-US',
  creditsSuffix = 'cr.',
): string {
  const units = Math.round(millions * 1_000_000);
  return `${units.toLocaleString(locale)} ${creditsSuffix}`;
}

export function formatDeltaMillions(delta: number): string {
  if (Math.abs(delta) < 0.05) {
    return '0M';
  }
  const sign = delta > 0 ? '+' : '';
  return `${sign}${formatCleanDecimal(delta, 1)}M`;
}

export function sumSquadValueMillions(
  players: readonly { readonly priceMillions: number }[],
): number {
  return players.reduce((acc, player) => acc + player.priceMillions, 0);
}
