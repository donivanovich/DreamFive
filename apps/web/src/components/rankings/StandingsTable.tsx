import { useMemo, useState } from 'react';

import { TeamLogo, UserAvatar } from '@/components/players/PlayerBadges';
import { SortableHeaderCell } from '@/components/shared/SortableTable';
import { useI18n } from '@/hooks/use-i18n';
import { formatLocaleDecimal } from '@/lib/formatters';
import { cycleThreeStateSort, sortItemsByState, type SortState } from '@/lib/table-sort';
import { cn } from '@/lib/utils';
import type { StandingEntry } from '@/types/fantasy';

type StandingSortKey = 'rank' | 'teamName' | 'managerHandle' | 'fantasyPoints' | 'streak';

export function StandingsTable({
  entries,
  compact = false,
}: {
  readonly entries: readonly StandingEntry[];
  readonly compact?: boolean;
}) {
  const { locale, t } = useI18n();
  const cellPad = compact ? 'px-2 py-2 sm:px-3 sm:py-2' : 'px-2.5 py-2 sm:px-4 sm:py-3';
  const [sort, setSort] = useState<SortState<StandingSortKey> | null>(null);

  const handleSort = (key: StandingSortKey) => {
    setSort((current) => cycleThreeStateSort(current, key));
  };

  const sortedEntries = useMemo(
    () =>
      sortItemsByState(entries, sort, {
        rank: (e) => e.rank,
        teamName: (e) => e.teamName,
        managerHandle: (e) => e.managerHandle,
        fantasyPoints: (e) => e.fantasyPoints,
        streak: (e) => e.lastFive.filter((r) => r === 'W').length,
      }),
    [entries, sort],
  );

  return (
    <div className="dream5-table-scroll rounded-lg border border-border bg-card">
      <table
        className={cn(
          'w-full border-collapse text-left text-sm',
          compact ? 'min-w-[360px]' : 'min-w-[620px]',
        )}
      >
        <thead>
          <tr className="border-b border-border bg-surface-deep/70 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
            <SortableHeaderCell
              columnKey="rank"
              label="#"
              sort={sort}
              onSort={handleSort}
              className={cn(cellPad, 'w-14 whitespace-nowrap')}
            />
            <SortableHeaderCell
              columnKey="teamName"
              label={t.rankingsPage.teamCol}
              sort={sort}
              onSort={handleSort}
              className={cn(cellPad, 'whitespace-nowrap')}
            />
            {!compact ? (
              <SortableHeaderCell
                columnKey="managerHandle"
                label={t.rankingsPage.managerCol}
                sort={sort}
                onSort={handleSort}
                className={cn(cellPad, 'whitespace-nowrap')}
              />
            ) : null}
            <SortableHeaderCell
              columnKey="fantasyPoints"
              label={t.common.dpTotal}
              sort={sort}
              onSort={handleSort}
              align="right"
              className={cn(cellPad, 'whitespace-nowrap')}
            />
            {!compact ? (
              <SortableHeaderCell
                columnKey="streak"
                label={t.rankingsPage.lastFiveCol}
                sort={sort}
                onSort={handleSort}
                align="right"
                className={cn(cellPad, 'whitespace-nowrap')}
              />
            ) : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/70">
          {sortedEntries.map((entry) => (
            <tr
              key={entry.teamId}
              className={cn(
                'transition-colors hover:bg-secondary/40',
                entry.isUserTeam && 'bg-primary/[0.08]',
              )}
            >
              <td
                className={cn(
                  cellPad,
                  'font-display text-base font-bold text-muted-foreground tabular-nums',
                )}
              >
                {entry.rank}
              </td>
              <td className={cellPad}>
                <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
                  <TeamLogo code={entry.teamAbbr} name={entry.teamName} size="sm" />
                  <span className="rounded border border-border bg-surface-deep px-1.5 py-0.5 font-display text-xs font-bold tracking-wider text-foreground">
                    {entry.teamAbbr}
                  </span>
                  <span className="hidden truncate font-medium text-foreground sm:inline">
                    {entry.teamName}
                  </span>
                  {entry.isUserTeam ? (
                    <span className="rounded bg-primary/20 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-primary uppercase">
                      {t.common.you}
                    </span>
                  ) : null}
                </div>
              </td>
              {!compact ? (
                <td className={cn(cellPad, 'whitespace-nowrap text-muted-foreground')}>
                  {entry.isCpuControlled || entry.managerHandle === 'CPU' ? (
                    <span className="text-xs font-medium tracking-wider uppercase">
                      {entry.managerHandle}
                    </span>
                  ) : (
                    <div className="flex items-center gap-2">
                      <UserAvatar
                        initials={entry.managerHandle.slice(0, 2)}
                        username={entry.managerHandle}
                        avatarUrl={entry.managerAvatarUrl ?? null}
                        size="sm"
                      />
                      <span className="max-w-[140px] truncate">{entry.managerHandle}</span>
                    </div>
                  )}
                </td>
              ) : null}
              <td className={cn(cellPad, 'text-right font-semibold text-foreground tabular-nums')}>
                {formatLocaleDecimal(entry.fantasyPoints, locale)}
              </td>
              {!compact ? (
                <td className={cn(cellPad, 'whitespace-nowrap')}>
                  <div className="flex items-center justify-end gap-2">
                    {entry.lastFive.map((result, idx) => (
                      <span
                        key={idx}
                        className={cn(
                          'inline-flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold',
                          result === 'W'
                            ? 'border border-emerald-500/30 bg-emerald-500/15 text-[var(--tone-success)]'
                            : 'border border-red-500/30 bg-red-500/15 text-[var(--tone-danger)]',
                        )}
                      >
                        {result}
                      </span>
                    ))}
                  </div>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
