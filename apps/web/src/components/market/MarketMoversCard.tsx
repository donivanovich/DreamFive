import { ArrowDownRight, ArrowUpRight } from 'lucide-react';

import { PlayerAvatar, PositionBadge, TrendDeltaBadge } from '@/components/players/PlayerBadges';
import { uiToContextTarget, usePlayerContextMenu } from '@/components/players/player-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { useI18n } from '@/hooks/use-i18n';
import { formatMillions, formatStatNumber } from '@/lib/formatters';
import type { Player } from '@/types/fantasy';

export function MarketMoversCard({
  title,
  direction,
  players,
}: {
  readonly title: string;
  readonly direction: 'up' | 'down';
  readonly players: readonly Player[];
}) {
  const { getTriggerProps, inspectPlayer } = usePlayerContextMenu();
  const { t } = useI18n();

  return (
    <Card>
      <CardHeader className="pb-2 sm:pb-3">
        <div className="flex items-center gap-2">
          {direction === 'up' ? (
            <ArrowUpRight className="h-4 w-4 text-[var(--tone-success)]" />
          ) : (
            <ArrowDownRight className="h-4 w-4 text-[var(--tone-danger)]" />
          )}
          <CardTitle>{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-1.5 sm:space-y-2.5">
        {players.map((player) => (
          <div
            key={player.id}
            {...getTriggerProps(uiToContextTarget(player))}
            onClick={() => {
              inspectPlayer(player.id);
            }}
            className="flex cursor-pointer items-center justify-between gap-2 rounded-md border border-border/80 bg-surface-deep/70 px-2.5 py-1.5 transition-colors hover:border-primary/40 hover:bg-secondary/40 sm:gap-3 sm:px-3 sm:py-2"
          >
            <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
              <PlayerAvatar
                initials={player.initials}
                name={player.name}
                seed={player.id}
                teamCode={player.teamAbbr}
                size="sm"
              />
              <PositionBadge position={player.position} />
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-foreground sm:text-sm">
                  {player.name}
                </p>
                <p className="text-[11px] text-muted-foreground sm:text-xs">
                  {player.teamAbbr} · {formatStatNumber(player.stats.fpPerGame)} {t.common.dp}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
              <span className="text-xs font-semibold text-foreground tabular-nums">
                {formatMillions(player.priceMillions)}
              </span>
              <TrendDeltaBadge delta={player.priceDeltaMillions} />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
