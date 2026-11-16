import { useQuery } from '@tanstack/react-query';
import { Trophy } from 'lucide-react';

import { usePlayerContextMenu } from '@/components/players/player-context';
import { StandingsTable } from '@/components/rankings/StandingsTable';
import { NoActiveLeagueCard } from '@/components/shared/EmptyState';
import { ErrorFallbackCard, LoadingSkeletonCard } from '@/components/shared/LoadingErrorStates';
import { PageHeader } from '@/components/shared/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { useDream5State } from '@/hooks/use-dream5-state';
import { useI18n } from '@/hooks/use-i18n';
import { rankingsApi } from '@/services/dream5-api';
import { mapStandingDtoToUi } from '@/services/mappers';

export function RankingsPage() {
  const { activeLeague, preferences } = useDream5State();
  const { getTriggerProps, inspectPlayer } = usePlayerContextMenu();
  const { t, f } = useI18n();
  const leagueId = activeLeague?.id ?? null;

  const rankingsQuery = useQuery({
    queryKey: ['league', leagueId, 'rankings'],
    queryFn: () => rankingsApi.get(leagueId ?? ''),
    enabled: leagueId !== null,
  });

  if (!activeLeague) {
    return <NoActiveLeagueCard />;
  }

  const standings = (rankingsQuery.data?.standings ?? []).map(mapStandingDtoToUi);
  const recentScores = rankingsQuery.data?.recentUserScores ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title={f(t.rankingsPage.title, { leagueName: activeLeague.name })}
        description={
          rankingsQuery.data
            ? f(t.rankingsPage.description, {
                seasonName: rankingsQuery.data.seasonName,
                round: rankingsQuery.data.currentRoundNumber,
              })
            : t.rankingsPage.fallbackDesc
        }
      />

      {rankingsQuery.isError ? (
        <ErrorFallbackCard
          title={t.rankingsPage.loadError}
          description={
            rankingsQuery.error instanceof Error
              ? rankingsQuery.error.message
              : t.common.loadErrorDesc
          }
        />
      ) : rankingsQuery.isLoading ? (
        <LoadingSkeletonCard />
      ) : (
        <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
          <StandingsTable entries={standings} compact={preferences.compactTables} />

          <Card className="h-fit">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <Trophy className="h-4 w-4 text-primary" />
                {t.rankingsPage.roundBreakdownTitle}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {recentScores.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t.rankingsPage.noClosedRounds}</p>
              ) : (
                recentScores.map((round) => (
                  <div
                    key={round.roundNumber}
                    className="space-y-2 rounded-lg border border-border bg-surface-deep/75 p-3 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <Badge variant="outline">
                        {t.common.roundLabel} {round.roundNumber}
                      </Badge>
                      <span className="font-display text-base font-bold text-primary tabular-nums">
                        {round.totalFp.toFixed(1)} {t.common.dp}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 text-center sm:grid-cols-5 sm:gap-2">
                      {(['PG', 'SG', 'SF', 'PF', 'C'] as const).map((pos) => {
                        const slot = round.breakdownJson[pos];
                        const playerId = slot?.playerId ?? null;
                        return (
                          <div
                            key={pos}
                            {...(playerId
                              ? getTriggerProps({
                                  id: playerId,
                                  name: slot?.playerName ?? pos,
                                  position: pos,
                                  teamId: activeLeague.userTeamId,
                                  teamCode: activeLeague.userTeamCode,
                                })
                              : {})}
                            onClick={() => {
                              if (playerId) {
                                inspectPlayer(playerId);
                              }
                            }}
                            className={
                              playerId
                                ? 'min-w-0 cursor-pointer rounded border border-border/70 bg-card/70 px-1 py-1.5 transition-colors hover:border-primary/45'
                                : 'min-w-0 rounded border border-border/70 bg-card/70 px-1 py-1.5'
                            }
                          >
                            <p className="text-[10px] font-bold text-primary">{pos}</p>
                            <p className="truncate text-[10px] text-muted-foreground">
                              {slot?.playerName?.split(' ').at(-1) ?? '-'}
                            </p>
                            <p className="font-semibold text-foreground tabular-nums">
                              {(slot?.fp ?? 0).toFixed(1)}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
