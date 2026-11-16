export interface DeterministicRng {
  readonly seed: string;
  /** Flotante en [0, 1). */
  nextFloat: () => number;
  /** Entero inclusivo en [min, max]. */
  nextInt: (min: number, max: number) => number;
  /** Flotante en [min, max]. */
  nextRange: (min: number, max: number) => number;
  /** Distribución aproximada normal estándar N(0, 1). */
  nextGaussian: () => number;
  /** Barajado Fisher-Yates sin mutar el array original. */
  shuffle: <T>(items: readonly T[]) => T[];
}

function hashSeedString(seed: string): number {
  let hash = 2_166_136_261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

/**
 * PRNG determinista Mulberry32 sembrado a partir de cadena.
 * Permite reproducir exactamente cualquier partido o catálogo mediante su semilla.
 */
export function createSeededRng(seed: string): DeterministicRng {
  let state = hashSeedString(seed) || 0x9e3779b9;

  const nextFloat = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };

  const nextInt = (min: number, max: number): number => {
    if (max <= min) {
      return min;
    }
    return min + Math.floor(nextFloat() * (max - min + 1));
  };

  const nextRange = (min: number, max: number): number => {
    return min + nextFloat() * (max - min);
  };

  const nextGaussian = (): number => {
    const u1 = Math.max(1e-7, nextFloat());
    const u2 = nextFloat();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  };

  const shuffle = <T>(items: readonly T[]): T[] => {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(nextFloat() * (i + 1));
      const tmp = copy[i];
      const target = copy[j];
      if (tmp !== undefined && target !== undefined) {
        copy[i] = target;
        copy[j] = tmp;
      }
    }
    return copy;
  };

  return {
    seed,
    nextFloat,
    nextInt,
    nextRange,
    nextGaussian,
    shuffle,
  };
}
