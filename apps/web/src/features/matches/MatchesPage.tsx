import { useQuery } from '@tanstack/react-query';
import { Activity, Filter } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { MatchCard } from '@/components/matches/MatchCard';
import { PositionBadge, TeamLogo } from '@/components/players/PlayerBadges';
import { usePlayerContextMenu } from '@/components/players/player-context';
import { EmptyState, NoActiveLeagueCard } from '@/components/shared/EmptyState';
import { ErrorFallbackCard, LoadingSkeletonCard } from '@/components/shared/LoadingErrorStates';
import { PageHeader } from '@/components/shared/PageHeader';
import { SortableHeaderCell } from '@/components/shared/SortableTable';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { ModalDialog } from '@/components/ui/Dialog';
import { useToast } from '@/components/ui/toast-context';
import { useDream5State } from '@/hooks/use-dream5-state';
import { useI18n } from '@/hooks/use-i18n';
import { formatExactCreditsFromMillions } from '@/lib/formatters';
import { translateMatchStatus } from '@/lib/i18n';
import { cycleThreeStateSort, sortItemsByState, type SortState } from '@/lib/table-sort';
import { matchesApi } from '@/services/dream5-api';
import { mapMatchDtoToUi } from '@/services/mappers';

type BoxScoreSortKey =
  'playerName' | 'teamCode' | 'position' | 'minutes' | 'pts' | 'reb' | 'ast' | 'fantasyPoints';

export function MatchesPage() {
  const { activeLeague } = useDream5State();
  const { getTriggerProps, inspectPlayer } = usePlayerContextMenu();
  const { showToast } = useToast();
  const { language, locale, t, f } = useI18n();
  const leagueId = activeLeague?.id ?? null;

  const [selectedRound, setSelectedRound] = useState<'ALL' | number>('ALL');
  const [onlyMyTeam, setOnlyMyTeam] = useState(false);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [boxSort, setBoxSort] = useState<SortState<BoxScoreSortKey> | null>(null);
  const detailErrorRef = useRef<string | null>(null);

  const matchesQuery = useQuery({
    queryKey: ['league', leagueId, 'matches', selectedRound, onlyMyTeam],
    queryFn: () =>
      matchesApi.list(leagueId ?? '', {
        ...(selectedRound !== 'ALL' ? { roundNumber: selectedRound } : {}),
        ...(onlyMyTeam && activeLeague ? { teamId: activeLeague.userTeamId } : {}),
      }),
    enabled: leagueId !== null,
  });

  const detailQuery = useQuery({
    queryKey: ['league', leagueId, 'match', selectedMatchId],
    queryFn: () => matchesApi.detail(leagueId ?? '', selectedMatchId ?? ''),
    enabled: leagueId !== null && selectedMatchId !== null,
  });

  useEffect(() => {
    if (!detailQuery.isError) {
      detailErrorRef.current = null;
      return;
    }
    const msg =
      detailQuery.error instanceof Error ? detailQuery.error.message : t.common.loadErrorDesc;
    const key = `${String(selectedMatchId)}::${msg}`;
    if (detailErrorRef.current !== key) {
      detailErrorRef.current = key;
      showToast({ tone: 'error', title: t.matchesPage.loadError, message: msg });
    }
  }, [
    detailQuery.error,
    detailQuery.isError,
    selectedMatchId,
    showToast,
    t.common.loadErrorDesc,
    t.matchesPage.loadError,
  ]);

  const sortedBoxScore = useMemo(() => {
    const rows = detailQuery.data?.playerStats ?? [];
    return sortItemsByState(rows, boxSort, {
      playerName: (r) => r.playerName,
      teamCode: (r) => r.teamCode,
      position: (r) => r.position,
      minutes: (r) => r.minutes,
      pts: (r) => r.pts,
      reb: (r) => r.reb,
      ast: (r) => r.ast,
      fantasyPoints: (r) => r.fantasyPoints,
    });
  }, [boxSort, detailQuery.data?.playerStats]);

  if (!activeLeague) {
    return <NoActiveLeagueCard />;
  }

  const matches = matchesQuery.data?.items ?? [];
  const visibleMatches =
    selectedRound === 'ALL' && !onlyMyTeam
      ? matches.filter(
          (m) =>
            m.roundNumber >= Math.max(1, activeLeague.currentRoundNumber) &&
            m.roundNumber <= activeLeague.currentRoundNumber + 2,
        )
      : matches;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t.matchesPage.title}
        description={f(t.matchesPage.description, { leagueName: activeLeague.name })}
        actions={
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <select
              aria-label={t.matchesPage.filterRoundAria}
              value={selectedRound === 'ALL' ? 'ALL' : String(selectedRound)}
              onChange={(e) => {
                setSelectedRound(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value));
              }}
              className="h-9 max-w-full min-w-0 flex-1 rounded-md border border-border bg-surface-deep px-3 text-sm text-foreground sm:flex-initial"
            >
              <option value="ALL">{t.matchesPage.upcomingRoundsOption}</option>
              {Array.from({ length: activeLeague.totalRounds }, (_, i) => i + 1).map((round) => (
                <option key={round} value={String(round)}>
                  {f(t.matchesPage.roundOption, { round })}
                  {round <= activeLeague.currentRoundNumber ? ` (${t.matchesPage.playedTag})` : ''}
                </option>
              ))}
            </select>

            <Button
              variant={onlyMyTeam ? 'primary' : 'outline'}
              size="sm"
              onClick={() => {
                setOnlyMyTeam((prev) => !prev);
              }}
            >
              <Filter className="h-3.5 w-3.5" />
              {f(t.matchesPage.onlyMyTeamBtn, { teamCode: activeLeague.userTeamCode })}
            </Button>
          </div>
        }
      />

      {matchesQuery.isError ? (
        <ErrorFallbackCard
          title={t.matchesPage.loadError}
          description={
            matchesQuery.error instanceof Error
              ? matchesQuery.error.message
              : t.common.loadErrorDesc
          }
        />
      ) : matchesQuery.isLoading ? (
        <LoadingSkeletonCard />
      ) : visibleMatches.length === 0 ? (
        <EmptyState title={t.matchesPage.emptyTitle} description={t.matchesPage.emptyDesc} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visibleMatches.map((item) => {
            const uiMatch = mapMatchDtoToUi(item, language);
            return (
              <div
                key={item.id}
                role="button"
                tabIndex={0}
                onClick={() => {
                  setSelectedMatchId(item.id);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelectedMatchId(item.id);
                  }
                }}
                className="cursor-pointer rounded-lg transition-transform hover:scale-[1.01]"
              >
                <MatchCard match={uiMatch} />
              </div>
            );
          })}
        </div>
      )}

      <ModalDialog
        open={selectedMatchId !== null}
        onClose={() => {
          setSelectedMatchId(null);
        }}
        title={
          detailQuery.data
            ? `${detailQuery.data.match.homeTeamCode} vs ${detailQuery.data.match.awayTeamCode}`
            : t.matchesPage.matchDetailFallback
        }
        description={
          detailQuery.data
            ? `${f(t.matchesPage.roundOption, { round: detailQuery.data.match.roundNumber })} · ${translateMatchStatus(detailQuery.data.match.status, language)}`
            : t.matchesPage.loadingBoxScore
        }
      >
        {detailQuery.isLoading ? (
          <LoadingSkeletonCard />
        ) : detailQuery.isError ? (
          <p className="py-4 text-sm text-muted-foreground">{t.common.loadErrorDesc}</p>
        ) : detailQuery.data ? (
          <div className="max-h-[68vh] min-w-0 space-y-4 overflow-x-hidden overflow-y-auto pr-1 text-xs">
            <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface-deep/80 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-2.5">
                <TeamLogo
                  code={detailQuery.data.match.homeTeamCode}
                  name={detailQuery.data.match.homeTeamName}
                  size="md"
                />
                <div className="min-w-0">
                  <p className="text-[11px] text-muted-foreground">{t.matchesPage.homeLabel}</p>
                  <p className="truncate font-display text-base font-bold text-foreground sm:text-lg">
                    {detailQuery.data.match.homeTeamName}
                  </p>
                </div>
              </div>
              <div className="shrink-0 text-center">
                <p className="font-display text-2xl font-bold text-primary tabular-nums">
                  {detailQuery.data.match.homeScore ?? '-'} :{' '}
                  {detailQuery.data.match.awayScore ?? '-'}
                </p>
                {detailQuery.data.match.overtimeCount > 0 ? (
                  <Badge variant="warning">{detailQuery.data.match.overtimeCount} OT</Badge>
                ) : null}
                {typeof detailQuery.data.match.winRewardMillions === 'number' &&
                detailQuery.data.match.winRewardMillions > 0 ? (
                  <p className="mt-1 text-[11px] font-semibold text-[var(--tone-success)] tabular-nums">
                    {t.matchesPage.winnerRewardLabel}: +
                    {formatExactCreditsFromMillions(
                      detailQuery.data.match.winRewardMillions,
                      locale,
                      t.common.creditsShort,
                    )}
                  </p>
                ) : null}
              </div>
              <div className="flex min-w-0 items-center justify-end gap-2.5 text-right">
                <div className="min-w-0">
                  <p className="text-[11px] text-muted-foreground">{t.matchesPage.awayLabel}</p>
                  <p className="truncate font-display text-base font-bold text-foreground sm:text-lg">
                    {detailQuery.data.match.awayTeamName}
                  </p>
                </div>
                <TeamLogo
                  code={detailQuery.data.match.awayTeamCode}
                  name={detailQuery.data.match.awayTeamName}
                  size="md"
                />
              </div>
            </div>

            {detailQuery.data.playerStats.length === 0 ? (
              <Card>
                <CardContent className="flex items-center gap-2 py-4 text-muted-foreground">
                  <Activity className="h-4 w-4 text-primary" />
                  {t.matchesPage.scheduledNotice}
                </CardContent>
              </Card>
            ) : (
              <>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">{t.matchesPage.boxScoreTitle}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="dream5-table-scroll rounded-lg border border-border/70 bg-surface-deep/70">
                      <table className="w-full min-w-[640px] border-collapse text-left text-xs">
                        <thead>
                          <tr className="border-b border-border bg-surface-elevated/90 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                            <SortableHeaderCell
                              columnKey="playerName"
                              label={t.matchesPage.playerCol}
                              sort={boxSort}
                              onSort={(key) => {
                                setBoxSort((prev) => cycleThreeStateSort(prev, key));
                              }}
                              className="px-2 py-2"
                            />
                            <SortableHeaderCell
                              columnKey="teamCode"
                              label={t.matchesPage.teamCol}
                              sort={boxSort}
                              onSort={(key) => {
                                setBoxSort((prev) => cycleThreeStateSort(prev, key));
                              }}
                              className="px-2 py-2"
                            />
                            <SortableHeaderCell
                              columnKey="position"
                              label={t.matchesPage.posCol}
                              sort={boxSort}
                              onSort={(key) => {
                                setBoxSort((prev) => cycleThreeStateSort(prev, key));
                              }}
                              className="px-2 py-2"
                            />
                            <SortableHeaderCell
                              columnKey="minutes"
                              label="MIN"
                              sort={boxSort}
                              onSort={(key) => {
                                setBoxSort((prev) => cycleThreeStateSort(prev, key));
                              }}
                              align="right"
                              className="px-2 py-2"
                            />
                            <SortableHeaderCell
                              columnKey="pts"
                              label={t.playerUi.ptsCol}
                              sort={boxSort}
                              onSort={(key) => {
                                setBoxSort((prev) => cycleThreeStateSort(prev, key));
                              }}
                              align="right"
                              className="px-2 py-2"
                            />
                            <SortableHeaderCell
                              columnKey="reb"
                              label={t.playerUi.rebCol}
                              sort={boxSort}
                              onSort={(key) => {
                                setBoxSort((prev) => cycleThreeStateSort(prev, key));
                              }}
                              align="right"
                              className="px-2 py-2"
                            />
                            <SortableHeaderCell
                              columnKey="ast"
                              label={t.playerUi.astCol}
                              sort={boxSort}
                              onSort={(key) => {
                                setBoxSort((prev) => cycleThreeStateSort(prev, key));
                              }}
                              align="right"
                              className="px-2 py-2"
                            />
                            <SortableHeaderCell
                              columnKey="fantasyPoints"
                              label={t.common.dp}
                              sort={boxSort}
                              onSort={(key) => {
                                setBoxSort((prev) => cycleThreeStateSort(prev, key));
                              }}
                              align="right"
                              className="px-2 py-2"
                            />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/60">
                          {sortedBoxScore.map((ps) => (
                            <tr
                              key={ps.playerInstanceId}
                              {...getTriggerProps({
                                id: ps.playerInstanceId,
                                name: ps.playerName,
                                position: ps.position,
                                teamId: ps.leagueTeamId,
                                teamCode: ps.teamCode,
                              })}
                              onClick={() => {
                                inspectPlayer(ps.playerInstanceId);
                              }}
                              className="cursor-pointer transition-colors hover:bg-secondary/50"
                            >
                              <td className="px-2 py-1.5">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-medium text-foreground">
                                    {ps.playerName}
                                  </span>
                                  {ps.wasStarter ? (
                                    <Badge variant="primary">{t.matchesPage.starterShort}</Badge>
                                  ) : null}
                                  {ps.injured ? (
                                    <Badge variant="danger">{t.matchesPage.injuredShort}</Badge>
                                  ) : null}
                                  {ps.ejected ? (
                                    <Badge variant="warning">{t.matchesPage.ejectedShort}</Badge>
                                  ) : null}
                                </div>
                              </td>
                              <td className="px-2 py-1.5 font-bold text-muted-foreground">
                                {ps.teamCode}
                              </td>
                              <td className="px-2 py-1.5">
                                <PositionBadge position={ps.position} />
                              </td>
                              <td className="px-2 py-1.5 text-right text-muted-foreground tabular-nums">
                                {ps.minutes}
                              </td>
                              <td className="px-2 py-1.5 text-right tabular-nums">{ps.pts}</td>
                              <td className="px-2 py-1.5 text-right tabular-nums">{ps.reb}</td>
                              <td className="px-2 py-1.5 text-right tabular-nums">{ps.ast}</td>
                              <td className="px-2 py-1.5 text-right font-display font-bold text-primary tabular-nums">
                                {ps.fantasyPoints.toFixed(1)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>

                {detailQuery.data.events.length > 0 ? (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">{t.matchesPage.eventsTitle}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-1">
                      {detailQuery.data.events.map((ev) => (
                        <div
                          key={ev.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded border border-border/60 bg-surface-deep/50 px-2 py-1"
                        >
                          <span className="min-w-0 text-foreground">{ev.description}</span>
                          <Badge variant="outline">
                            Q{ev.quarter} · {ev.clockLabel}
                          </Badge>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                ) : null}
              </>
            )}
          </div>
        ) : null}
      </ModalDialog>
    </div>
  );
}
