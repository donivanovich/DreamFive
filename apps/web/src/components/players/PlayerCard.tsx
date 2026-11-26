import {
  AvailabilityBadge,
  PlayerAvatar,
  PositionBadge,
  RoleBadge,
  TrendDeltaBadge,
} from '@/components/players/PlayerBadges';
import { uiToContextTarget, usePlayerContextMenu } from '@/components/players/player-context';
import { Card, CardContent } from '@/components/ui/Card';
import { useI18n } from '@/hooks/use-i18n';
import { formatMillions, formatStatNumber } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import type { Player } from '@/types/fantasy';

export interface PlayerCardProps {
  readonly player: Player;
  readonly isStarter?: boolean;
  readonly showTeam?: boolean;
  readonly onSelect?: (player: Player) => void;
}

export function PlayerCard({
  player,
  isStarter = false,
  showTeam = true,
  onSelect,
}: PlayerCardProps) {
  const { getTriggerProps } = usePlayerContextMenu();
  const { t } = useI18n();

  return (
    <Card
      {...getTriggerProps(uiToContextTarget(player))}
      onClick={
        onSelect
          ? () => {
              onSelect(player);
            }
          : undefined
      }
      className={cn(
        'transition-colors hover:border-primary/45',
        isStarter && 'border-primary/40',
        onSelect && 'cursor-pointer',
      )}
    >
      <CardContent className="space-y-2.5 pt-3.5 sm:space-y-3 sm:pt-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <PlayerAvatar
              initials={player.initials}
              name={player.name}
              seed={player.id}
              teamCode={player.teamAbbr}
              highlight={isStarter}
            />
            <div className="min-w-0">
              <p className="truncate font-semibold text-foreground">{player.name}</p>
              <p className="text-xs text-muted-foreground">
                {showTeam ? `${player.teamAbbr} · ` : ''}
                {player.age} {t.common.yearsOld}
              </p>
            </div>
          </div>
          <PositionBadge position={player.position} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <RoleBadge role={player.role} />
          <AvailabilityBadge status={player.status} />
          {isStarter ? (
            <span className="rounded bg-primary/20 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-primary uppercase">
              {t.common.starterBadge}
            </span>
          ) : null}
        </div>

        <div className="grid grid-cols-4 gap-2 rounded-md border border-border/80 bg-surface-deep/80 px-2.5 py-2 text-center">
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase">
              {t.playerUi.ptsCol}
            </p>
            <p className="text-xs font-semibold text-foreground tabular-nums">
              {formatStatNumber(player.stats.pts)}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase">
              {t.playerUi.rebCol}
            </p>
            <p className="text-xs font-semibold text-foreground tabular-nums">
              {formatStatNumber(player.stats.reb)}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase">
              {t.playerUi.astCol}
            </p>
            <p className="text-xs font-semibold text-foreground tabular-nums">
              {formatStatNumber(player.stats.ast)}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase">
              {t.common.dp}
            </p>
            <p className="text-xs font-bold text-primary tabular-nums">
              {formatStatNumber(player.stats.fpPerGame)}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-border/70 pt-2.5">
          <div>
            <p className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
              {t.playerUi.currentValue}
            </p>
            <p className="text-sm font-bold text-foreground tabular-nums">
              {formatMillions(player.priceMillions)}
            </p>
          </div>
          <TrendDeltaBadge delta={player.priceDeltaMillions} />
        </div>
      </CardContent>
    </Card>
  );
}
