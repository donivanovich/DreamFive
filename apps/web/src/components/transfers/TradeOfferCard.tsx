import { ArrowLeftRight } from 'lucide-react';

import { PositionBadge } from '@/components/players/PlayerBadges';
import { usePlayerContextMenu } from '@/components/players/player-context';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { useI18n } from '@/hooks/use-i18n';
import { formatMillions } from '@/lib/formatters';
import { translateTradeStatus } from '@/lib/i18n';
import type { TradeOffer } from '@/types/fantasy';

const STATUS_BADGE: Record<TradeOffer['status'], 'warning' | 'success' | 'danger'> = {
  Pendiente: 'warning',
  Aceptada: 'success',
  Rechazada: 'danger',
};

export function TradeOfferCard({
  offer,
  resolvedStatus,
  busy = false,
  onAccept,
  onReject,
  onWithdraw,
}: {
  readonly offer: TradeOffer;
  readonly resolvedStatus: TradeOffer['status'];
  readonly busy?: boolean;
  readonly onAccept?: () => void;
  readonly onReject?: () => void;
  readonly onWithdraw?: () => void;
}) {
  const { getTriggerProps, inspectPlayer } = usePlayerContextMenu();
  const { language, t } = useI18n();

  return (
    <Card>
      <CardContent className="space-y-4 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate font-semibold text-foreground">{offer.counterpartyTeam}</p>
              <span className="text-xs text-muted-foreground">{offer.counterpartyHandle}</span>
            </div>
            <p className="text-xs text-muted-foreground">{offer.dateLabel}</p>
          </div>
          <Badge variant={STATUS_BADGE[resolvedStatus]}>
            {translateTradeStatus(resolvedStatus, language)}
          </Badge>
        </div>

        <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr] md:items-center">
          <div className="min-w-0 space-y-2 rounded-md border border-border bg-surface-deep/80 p-3">
            <p className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
              {offer.bucket === 'incoming'
                ? t.transfersPage.receiveLabel
                : t.transfersPage.sendLabel}
            </p>
            {offer.offeredPlayers.map((player) => (
              <div
                key={player.id}
                {...getTriggerProps({
                  id: player.id,
                  name: player.name,
                  position: player.position,
                  priceMillions: player.priceMillions,
                })}
                onClick={() => {
                  inspectPlayer(player.id);
                }}
                className="flex cursor-pointer items-center justify-between gap-2 rounded px-1 py-0.5 text-sm transition-colors hover:bg-secondary/45"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <PositionBadge position={player.position} />
                  <span className="truncate text-foreground">{player.name}</span>
                </div>
                <span className="text-xs font-semibold text-muted-foreground tabular-nums">
                  {formatMillions(player.priceMillions)}
                </span>
              </div>
            ))}
            {offer.cashOfferedMillions > 0 ? (
              <p className="text-xs font-semibold text-[var(--tone-success)]">
                + {formatMillions(offer.cashOfferedMillions)} {t.transfersPage.budgetSuffix}
              </p>
            ) : null}
          </div>

          <div className="hidden justify-center text-muted-foreground md:flex">
            <ArrowLeftRight className="h-4 w-4" />
          </div>

          <div className="min-w-0 space-y-2 rounded-md border border-border bg-surface-deep/80 p-3">
            <p className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
              {offer.bucket === 'incoming'
                ? t.transfersPage.giveLabel
                : t.transfersPage.requestLabel}
            </p>
            {offer.requestedPlayers.map((player) => (
              <div
                key={player.id}
                {...getTriggerProps({
                  id: player.id,
                  name: player.name,
                  position: player.position,
                  priceMillions: player.priceMillions,
                })}
                onClick={() => {
                  inspectPlayer(player.id);
                }}
                className="flex cursor-pointer items-center justify-between gap-2 rounded px-1 py-0.5 text-sm transition-colors hover:bg-secondary/45"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <PositionBadge position={player.position} />
                  <span className="truncate text-foreground">{player.name}</span>
                </div>
                <span className="text-xs font-semibold text-muted-foreground tabular-nums">
                  {formatMillions(player.priceMillions)}
                </span>
              </div>
            ))}
            {offer.cashRequestedMillions > 0 ? (
              <p className="text-xs font-semibold text-[var(--tone-warning)]">
                + {formatMillions(offer.cashRequestedMillions)} {t.transfersPage.budgetSuffix}
              </p>
            ) : null}
          </div>
        </div>

        {resolvedStatus === 'Pendiente' && (onAccept || onReject || onWithdraw) ? (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border/70 pt-3">
            {onReject ? (
              <Button variant="danger" size="sm" disabled={busy} onClick={onReject}>
                {t.transfersPage.rejectTradeBtn}
              </Button>
            ) : null}
            {onAccept ? (
              <Button variant="primary" size="sm" disabled={busy} onClick={onAccept}>
                {t.transfersPage.acceptTradeBtn}
              </Button>
            ) : null}
            {onWithdraw ? (
              <Button variant="danger" size="sm" disabled={busy} onClick={onWithdraw}>
                {t.transfersPage.withdrawOfferBtn}
              </Button>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
