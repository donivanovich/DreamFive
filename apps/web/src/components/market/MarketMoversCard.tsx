import { ArrowDownRight, ArrowUpRight } from 'lucide-react';

import { PlayerAvatar, PositionBadge, TrendDeltaBadge } from '@/components/players/PlayerBadges';
import { uiToContextTarget, usePlayerContextMenu } from '@/components/players/player-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { useI18n } from '@/hooks/use-i18n';
import { formatMillions } from '@/lib/formatters';
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
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          {direction === 'up' ? (
            <ArrowUpRight className="h-4 w-4 text-[var(--tone-success)]" />
          ) : (
            <ArrowDownRight className="h-4 w-4 text-[var(--tone-danger)]" />
          )}
          <CardTitle>{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {players.map((player) => (
          <div
            key={player.id}
            {...getTriggerProps(uiToContextTarget(player))}
            onClick={() => {
              inspectPlayer(player.id);
            }}
            className="flex cursor-pointer items-center justify-between gap-3 rounded-md border border-border/80 bg-surface-deep/70 px-3 py-2 transition-colors hover:border-primary/40 hover:bg-secondary/40"
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <PlayerAvatar
                initials={player.initials}
                name={player.name}
                seed={player.id}
                teamCode={player.teamAbbr}
                size="sm"
              />
              <PositionBadge position={player.position} />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{player.name}</p>
                <p className="text-xs text-muted-foreground">
                  {player.teamAbbr} · {player.stats.fpPerGame.toFixed(1)} {t.common.dp}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
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
