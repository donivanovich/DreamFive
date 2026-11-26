import { type ReactNode, useMemo, useState } from 'react';

import {
  AvailabilityBadge,
  PlayerAvatar,
  PositionBadge,
  RoleBadge,
  TrendDeltaBadge,
} from '@/components/players/PlayerBadges';
import { uiToContextTarget, usePlayerContextMenu } from '@/components/players/player-context';
import { SortableHeaderCell } from '@/components/shared/SortableTable';
import { useI18n } from '@/hooks/use-i18n';
import { formatMillions, formatStatNumber } from '@/lib/formatters';
import { cycleThreeStateSort, sortItemsByState, type SortState } from '@/lib/table-sort';
import { cn } from '@/lib/utils';
import type { Player } from '@/types/fantasy';

export type PlayerTableSortKey = 'name' | 'position' | 'role' | 'status' | 'fp' | 'price' | 'delta';

const POSITION_ORDER: Record<Player['position'], number> = {
  PG: 1,
  SG: 2,
  SF: 3,
  PF: 4,
  C: 5,
};

const ROLE_ORDER: Record<Player['role'], number> = {
  Superestrella: 1,
  Estrella: 2,
  Inicial: 3,
  Rotación: 4,
  Rookie: 5,
  Calientabanquillos: 6,
};

const STATUS_ORDER: Record<Player['status'], number> = {
  Healthy: 1,
  Questionable: 2,
  Injured: 3,
  Suspended: 4,
};

export interface PlayerTableProps {
  readonly players: readonly Player[];
  readonly compact?: boolean;
  readonly showTeam?: boolean;
  readonly showDelta?: boolean;
  readonly starterIds?: ReadonlySet<string>;
  readonly sort?: SortState<PlayerTableSortKey> | null;
  readonly onSortChange?: (next: SortState<PlayerTableSortKey> | null) => void;
  readonly onSelectPlayer?: (player: Player) => void;
  readonly renderAction?: (player: Player) => ReactNode;
}

export function PlayerTable({
  players,
  compact = false,
  showTeam = false,
  showDelta = false,
  starterIds,
  sort: controlledSort,
  onSortChange,
  onSelectPlayer,
  renderAction,
}: PlayerTableProps) {
  const cellPad = compact ? 'px-3 py-2' : 'px-4 py-3';
  const { getTriggerProps } = usePlayerContextMenu();
  const { t } = useI18n();
  const [internalSort, setInternalSort] = useState<SortState<PlayerTableSortKey> | null>(null);
  const sort = onSortChange ? (controlledSort ?? null) : internalSort;

  const handleSort = (key: PlayerTableSortKey) => {
    const next = cycleThreeStateSort(sort, key);
    if (onSortChange) {
      onSortChange(next);
    } else {
      setInternalSort(next);
    }
  };

  const sortedPlayers = useMemo(
    () =>
      onSortChange
        ? [...players]
        : sortItemsByState(players, sort, {
            name: (p) => p.name,
            position: (p) => POSITION_ORDER[p.position],
            role: (p) => ROLE_ORDER[p.role],
            status: (p) => STATUS_ORDER[p.status],
            fp: (p) => p.stats.fpPerGame,
            price: (p) => p.priceMillions,
            delta: (p) => p.priceDeltaMillions,
          }),
    [onSortChange, players, sort],
  );

  return (
    <div className="dreamfive-table-scroll rounded-lg border border-border bg-card">
      <table className="w-full min-w-[680px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-deep/70 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
            <SortableHeaderCell
              columnKey="name"
              label={t.playerUi.playerCol}
              sort={sort}
              onSort={handleSort}
              className={cellPad}
            />
            <SortableHeaderCell
              columnKey="position"
              label={t.playerUi.posCol}
              sort={sort}
              onSort={handleSort}
              className={cellPad}
            />
            <SortableHeaderCell
              columnKey="role"
              label={t.playerUi.roleCol}
              sort={sort}
              onSort={handleSort}
              className={cn(cellPad, 'whitespace-nowrap')}
            />
            <SortableHeaderCell
              columnKey="status"
              label={t.playerUi.statusCol}
              sort={sort}
              onSort={handleSort}
              className={cn(cellPad, 'whitespace-nowrap')}
            />
            <SortableHeaderCell
              columnKey="fp"
              label={t.playerUi.dpCol}
              sort={sort}
              onSort={handleSort}
              align="right"
              className={cellPad}
            />
            <SortableHeaderCell
              columnKey="price"
              label={t.playerUi.priceCol}
              sort={sort}
              onSort={handleSort}
              align="right"
              className={cellPad}
            />
            {showDelta ? (
              <SortableHeaderCell
                columnKey="delta"
                label={t.playerUi.deltaCol}
                sort={sort}
                onSort={handleSort}
                align="right"
                className={cellPad}
              />
            ) : null}
            {renderAction ? (
              <th className={cn(cellPad, 'text-right')}>{t.playerUi.actionCol}</th>
            ) : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/70">
          {sortedPlayers.map((player) => {
            const isStarter = starterIds?.has(player.id) ?? false;
            return (
              <tr
                key={player.id}
                {...getTriggerProps(uiToContextTarget(player))}
                onClick={
                  onSelectPlayer
                    ? () => {
                        onSelectPlayer(player);
                      }
                    : undefined
                }
                className={cn(
                  'transition-colors hover:bg-secondary/45',
                  isStarter && 'bg-primary/[0.04]',
                  onSelectPlayer && 'cursor-pointer',
                )}
              >
                <td className={cellPad}>
                  <div className="flex min-w-[155px] items-center gap-2.5">
                    <PlayerAvatar
                      initials={player.initials}
                      name={player.name}
                      seed={player.id}
                      teamCode={player.teamAbbr}
                      highlight={isStarter}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium text-foreground">{player.name}</span>
                        {isStarter ? (
                          <span className="rounded bg-primary/20 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-primary uppercase">
                            {t.common.starterBadge}
                          </span>
                        ) : null}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {showTeam
                          ? `${player.teamAbbr} · ${String(player.age)} ${t.common.yearsOld}`
                          : `${String(player.age)} ${t.common.yearsOld}`}
                      </p>
                    </div>
                  </div>
                </td>
                <td className={cellPad}>
                  <PositionBadge position={player.position} />
                </td>
                <td className={cn(cellPad, 'whitespace-nowrap')}>
                  <RoleBadge role={player.role} />
                </td>
                <td className={cn(cellPad, 'whitespace-nowrap')}>
                  <AvailabilityBadge status={player.status} />
                </td>
                <td className={cn(cellPad, 'text-right font-semibold text-primary tabular-nums')}>
                  {formatStatNumber(player.stats.fpPerGame)}
                </td>
                <td
                  className={cn(cellPad, 'text-right font-semibold text-foreground tabular-nums')}
                >
                  {formatMillions(player.priceMillions)}
                </td>
                {showDelta ? (
                  <td className={cn(cellPad, 'text-right')}>
                    <TrendDeltaBadge delta={player.priceDeltaMillions} />
                  </td>
                ) : null}
                {renderAction ? (
                  <td
                    className={cn(cellPad, 'text-right')}
                    onClick={(event) => {
                      event.stopPropagation();
                    }}
                  >
                    {renderAction(player)}
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
