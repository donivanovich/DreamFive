export type SortDirection = 'asc' | 'desc';

export interface SortState<K extends string> {
  readonly key: K;
  readonly dir: SortDirection;
}

/**
 * Cicla el orden de una columna en tres pasos:
 * 1) ascendente (arriba a abajo: A->Z / menor->mayor)
 * 2) descendente (abajo a arriba: Z->A / mayor->menor)
 * 3) null (orden por defecto)
 */
export function cycleThreeStateSort<K extends string>(
  current: SortState<K> | null,
  key: K,
): SortState<K> | null {
  if (current?.key !== key) {
    return { key, dir: 'asc' };
  }
  if (current.dir === 'asc') {
    return { key, dir: 'desc' };
  }
  return null;
}

export function sortItemsByState<T, K extends string>(
  items: readonly T[],
  sort: SortState<K> | null,
  accessors: Record<K, (row: T) => string | number>,
): T[] {
  if (!sort) {
    return [...items];
  }
  const getter = accessors[sort.key];
  const indexed = items.map((item, idx) => ({ item, idx, value: getter(item) }));
  indexed.sort((a, b) => {
    const cmp =
      typeof a.value === 'number' && typeof b.value === 'number'
        ? a.value - b.value
        : String(a.value).localeCompare(String(b.value), 'es', {
            numeric: true,
            sensitivity: 'base',
          });
    if (cmp === 0) {
      return a.idx - b.idx;
    }
    return sort.dir === 'asc' ? cmp : -cmp;
  });
  return indexed.map((entry) => entry.item);
}
