import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import type { ReactNode } from 'react';

import type { SortState } from '@/lib/table-sort';
import { cn } from '@/lib/utils';

export function SortableHeaderCell<K extends string>({
  columnKey,
  label,
  sort,
  onSort,
  align = 'left',
  className,
}: {
  readonly columnKey: K;
  readonly label: ReactNode;
  readonly sort: SortState<K> | null;
  readonly onSort: (key: K) => void;
  readonly align?: 'left' | 'right' | 'center';
  readonly className?: string;
}) {
  const isActive = sort?.key === columnKey;
  const ariaSort = isActive ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none';

  return (
    <th
      aria-sort={ariaSort}
      className={cn(
        'px-3 py-2.5 select-none',
        align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left',
        className,
      )}
    >
      <button
        type="button"
        onClick={() => {
          onSort(columnKey);
        }}
        className={cn(
          'inline-flex items-center gap-1 rounded px-1 py-0.5 text-left font-medium transition-colors hover:text-foreground',
          align === 'right' && 'flex-row-reverse',
          isActive ? 'text-primary' : 'text-muted-foreground',
        )}
      >
        <span>{label}</span>
        {isActive && sort.dir === 'asc' ? (
          <ArrowUp className="h-3 w-3 shrink-0" />
        ) : isActive && sort.dir === 'desc' ? (
          <ArrowDown className="h-3 w-3 shrink-0" />
        ) : (
          <ArrowUpDown className="h-3 w-3 shrink-0 opacity-55" />
        )}
      </button>
    </th>
  );
}
