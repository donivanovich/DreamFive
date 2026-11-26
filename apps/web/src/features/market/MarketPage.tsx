import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ArrowLeftRight, TrendingUp } from 'lucide-react';
import { useMemo, useState } from 'react';

import { MarketMoversCard } from '@/components/market/MarketMoversCard';
import { PositionBadge, TeamLogo, TrendDeltaBadge } from '@/components/players/PlayerBadges';
import { usePlayerContextMenu } from '@/components/players/player-context';
import { PlayerDetailModal } from '@/components/players/PlayerDetailModal';
import { PlayerTable } from '@/components/players/PlayerTable';
import { NoActiveLeagueCard } from '@/components/shared/EmptyState';
import { ErrorFallbackCard, LoadingSkeletonCard } from '@/components/shared/LoadingErrorStates';
import { PageHeader } from '@/components/shared/PageHeader';
import { SortableHeaderCell } from '@/components/shared/SortableTable';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { useDream5State } from '@/hooks/use-dream5-state';
import { useI18n } from '@/hooks/use-i18n';
import { formatMillions } from '@/lib/formatters';
import { translateMarketMode } from '@/lib/i18n';
import { cycleThreeStateSort, sortItemsByState, type SortState } from '@/lib/table-sort';
import { marketApi } from '@/services/dream5-api';
import { mapPlayerDtoToUi } from '@/services/mappers';

type MovementSortKey =
  'playerName' | 'position' | 'teamCode' | 'reason' | 'priceMillions' | 'deltaMillions';

export function MarketPage() {
  const { activeLeague, preferences } = useDream5State();
  const { getTriggerProps } = usePlayerContextMenu();
  const { language, t, f } = useI18n();
  const leagueId = activeLeague?.id ?? null;
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [movementSort, setMovementSort] = useState<SortState<MovementSortKey> | null>(null);

  const marketQuery = useQuery({
    queryKey: ['league', leagueId, 'market'],
    queryFn: () => marketApi.get(leagueId ?? ''),
    enabled: leagueId !== null,
  });

  const sortedMovements = useMemo(() => {
    const items = (marketQuery.data?.recentMovements ?? []).slice(0, 20);
    return sortItemsByState(items, movementSort, {
      playerName: (m) => m.playerName,
      position: (m) => m.position,
      teamCode: (m) => m.teamCode,
      reason: (m) => m.reason,
      priceMillions: (m) => m.priceMillions,
      deltaMillions: (m) => m.deltaMillions,
    });
  }, [marketQuery.data?.recentMovements, movementSort]);

  if (!activeLeague) {
    return <NoActiveLeagueCard />;
  }

  const gainers = (marketQuery.data?.gainers ?? []).map(mapPlayerDtoToUi);
  const fallers = (marketQuery.data?.fallers ?? []).map(mapPlayerDtoToUi);
  const mostValuable = (marketQuery.data?.mostValuable ?? []).map(mapPlayerDtoToUi);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t.marketPage.title}
        description={f(t.marketPage.description, {
          leagueName: activeLeague.name,
          mode: translateMarketMode(
            marketQuery.data?.marketMode ?? activeLeague.marketMode,
            language,
          ),
        })}
        actions={
          <Link to="/transfers">
            <Button variant="primary" size="sm">
              <ArrowLeftRight className="h-4 w-4" />
              {t.marketPage.negotiateTradeBtn}
            </Button>
          </Link>
        }
      />

      {marketQuery.isError ? (
        <ErrorFallbackCard
          title={t.marketPage.loadError}
          description={
            marketQuery.error instanceof Error ? marketQuery.error.message : t.common.loadErrorDesc
          }
        />
      ) : marketQuery.isLoading ? (
        <LoadingSkeletonCard />
      ) : (
        <>
          <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
            <MarketMoversCard title={t.marketPage.risersTitle} direction="up" players={gainers} />
            <MarketMoversCard
              title={t.marketPage.fallersTitle}
              direction="down"
              players={fallers}
            />
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                {f(t.marketPage.mostValuableTitle, { leagueName: activeLeague.name })}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <PlayerTable
                players={mostValuable}
                compact={preferences.compactTables}
                showTeam
                showDelta
                onSelectPlayer={(player) => {
                  setSelectedPlayerId(player.id);
                }}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle>{t.marketPage.movementsTitle}</CardTitle>
            </CardHeader>
            <CardContent>
              {sortedMovements.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t.marketPage.noMovements}</p>
              ) : (
                <div className="dream5-table-scroll rounded-lg border border-border bg-surface-deep/75">
                  <table className="w-full min-w-[640px] border-collapse text-left text-xs">
                    <thead>
                      <tr className="border-b border-border bg-surface-elevated/90 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                        <SortableHeaderCell
                          columnKey="playerName"
                          label={t.marketPage.playerCol}
                          sort={movementSort}
                          onSort={(key) => {
                            setMovementSort((prev) => cycleThreeStateSort(prev, key));
                          }}
                        />
                        <SortableHeaderCell
                          columnKey="position"
                          label={t.marketPage.posCol}
                          sort={movementSort}
                          onSort={(key) => {
                            setMovementSort((prev) => cycleThreeStateSort(prev, key));
                          }}
                        />
                        <SortableHeaderCell
                          columnKey="teamCode"
                          label={t.marketPage.teamCol}
                          sort={movementSort}
                          onSort={(key) => {
                            setMovementSort((prev) => cycleThreeStateSort(prev, key));
                          }}
                        />
                        <SortableHeaderCell
                          columnKey="reason"
                          label={t.marketPage.reasonCol}
                          sort={movementSort}
                          onSort={(key) => {
                            setMovementSort((prev) => cycleThreeStateSort(prev, key));
                          }}
                          className="whitespace-nowrap"
                        />
                        <SortableHeaderCell
                          columnKey="priceMillions"
                          label={t.marketPage.priceCol}
                          sort={movementSort}
                          onSort={(key) => {
                            setMovementSort((prev) => cycleThreeStateSort(prev, key));
                          }}
                          align="right"
                        />
                        <SortableHeaderCell
                          columnKey="deltaMillions"
                          label={t.marketPage.deltaCol}
                          sort={movementSort}
                          onSort={(key) => {
                            setMovementSort((prev) => cycleThreeStateSort(prev, key));
                          }}
                          align="right"
                        />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/70">
                      {sortedMovements.map((mov) => (
                        <tr
                          key={mov.id}
                          {...getTriggerProps({
                            id: mov.playerId,
                            name: mov.playerName,
                            position: mov.position,
                            teamCode: mov.teamCode,
                            priceMillions: mov.priceMillions,
                          })}
                          onClick={() => {
                            setSelectedPlayerId(mov.playerId);
                          }}
                          className="cursor-pointer transition-colors hover:bg-secondary/50"
                        >
                          <td className="px-3 py-2.5 font-medium whitespace-nowrap text-foreground">
                            {mov.playerName}
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <PositionBadge position={mov.position} />
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <span className="inline-flex items-center gap-1.5">
                              <TeamLogo code={mov.teamCode} size="sm" />
                              <Badge variant="outline">{mov.teamCode}</Badge>
                            </span>
                          </td>
                          <td className="max-w-xs truncate px-3 py-2.5 text-muted-foreground">
                            {mov.reason}
                          </td>
                          <td className="px-3 py-2.5 text-right font-semibold text-foreground tabular-nums">
                            {formatMillions(mov.priceMillions)}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <TrendDeltaBadge delta={mov.deltaMillions} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <PlayerDetailModal
        leagueId={leagueId}
        playerId={selectedPlayerId}
        onClose={() => {
          setSelectedPlayerId(null);
        }}
      />
    </div>
  );
}
