import type { AvailabilityStatus, PlayerRole, Position } from '@/types/fantasy';

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

export function formatMillions(value: number): string {
  const scaledHundredths = Math.round(Math.abs(value) * 100);
  if (scaledHundredths % 10 !== 0) {
    return `${value.toFixed(2)}M`;
  }
  return `${value.toFixed(1)}M`;
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
    return '0.0M';
  }
  const sign = delta > 0 ? '+' : '';
  return `${sign}${delta.toFixed(1)}M`;
}

export function sumSquadValueMillions(
  players: readonly { readonly priceMillions: number }[],
): number {
  return players.reduce((acc, player) => acc + player.priceMillions, 0);
}
