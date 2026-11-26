import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, RotateCcw, Save, Unlock } from 'lucide-react';
import { useState } from 'react';

import {
  AvailabilityBadge,
  PlayerAvatar,
  PositionBadge,
  RoleBadge,
} from '@/components/players/PlayerBadges';
import { uiToContextTarget, usePlayerContextMenu } from '@/components/players/player-context';
import { NoActiveLeagueCard } from '@/components/shared/EmptyState';
import { ErrorFallbackCard, LoadingSkeletonCard } from '@/components/shared/LoadingErrorStates';
import { PageHeader } from '@/components/shared/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { useToast } from '@/components/ui/toast-context';
import { useDreamFiveState } from '@/hooks/use-dreamfive-state';
import { useI18n } from '@/hooks/use-i18n';
import { formatMillions, formatStatNumber } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import { lineupApi, teamsApi } from '@/services/dreamfive-api';
import { mapPlayerDtoToUi } from '@/services/mappers';
import type { Position } from '@/types/fantasy';

const POSITIONS: readonly Position[] = ['PG', 'SG', 'SF', 'PF', 'C'];

export function LineupPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { getTriggerProps } = usePlayerContextMenu();
  const { activeLeague } = useDreamFiveState();
  const { t, f } = useI18n();
  const leagueId = activeLeague?.id ?? null;

  const [draftState, setDraftState] = useState<{
    readonly leagueId: string;
    readonly map: Record<Position, string>;
  } | null>(null);

  const lineupQuery = useQuery({
    queryKey: ['league', leagueId, 'lineup', 'next'],
    queryFn: () => lineupApi.get(leagueId ?? ''),
    enabled: leagueId !== null,
  });

  const rosterQuery = useQuery({
    queryKey: ['league', leagueId, 'team', activeLeague?.userTeamId],
    queryFn: () => teamsApi.detail(leagueId ?? '', activeLeague?.userTeamId ?? ''),
    enabled: leagueId !== null && activeLeague?.userTeamId !== undefined,
  });

  const baseStarters: Record<Position, string> = {
    PG: lineupQuery.data?.pgPlayerId ?? '',
    SG: lineupQuery.data?.sgPlayerId ?? '',
    SF: lineupQuery.data?.sfPlayerId ?? '',
    PF: lineupQuery.data?.pfPlayerId ?? '',
    C: lineupQuery.data?.cPlayerId ?? '',
  };
  const starters =
    draftState && leagueId && draftState.leagueId === leagueId ? draftState.map : baseStarters;

  const saveMutation = useMutation({
    mutationFn: () =>
      lineupApi.save(
        leagueId ?? '',
        {
          pgPlayerId: starters.PG,
          sgPlayerId: starters.SG,
          sfPlayerId: starters.SF,
          pfPlayerId: starters.PF,
          cPlayerId: starters.C,
        },
        lineupQuery.data?.roundNumber,
      ),
    onSuccess: async (saved) => {
      setDraftState(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['league', leagueId, 'lineup'] }),
        queryClient.invalidateQueries({
          queryKey: ['league', leagueId, 'team', activeLeague?.userTeamId],
        }),
        queryClient.invalidateQueries({ queryKey: ['leagues'] }),
      ]);
      showToast({
        tone: 'success',
        title: t.lineup.savedToastTitle,
        message: f(t.lineup.savedToastMsg, { round: saved.roundNumber }),
      });
    },
    onError: (err) => {
      showToast({
        tone: 'error',
        title: t.lineup.saveErrTitle,
        message: err instanceof Error ? err.message : t.lineup.saveErrFallback,
      });
    },
  });

  if (!activeLeague) {
    return <NoActiveLeagueCard />;
  }

  const roster = (rosterQuery.data?.roster ?? []).map(mapPlayerDtoToUi);
  const byId = new Map(roster.map((p) => [p.id, p]));
  const isLocked = lineupQuery.data?.isLocked ?? false;
  const starterSet = new Set(Object.values(starters).filter(Boolean));
  const hasChanges =
    lineupQuery.data !== undefined && POSITIONS.some((pos) => starters[pos] !== baseStarters[pos]);
  const targetRound = lineupQuery.data?.roundNumber ?? activeLeague.currentRoundNumber + 1;

  const projectedAvgDp = Object.values(starters).reduce((sum, id) => {
    const player = byId.get(id);
    return sum + (player ? player.stats.fpPerGame : 0);
  }, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t.lineup.title}
        description={f(t.lineup.description, {
          round: targetRound,
          leagueName: activeLeague.name,
        })}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={isLocked ? 'warning' : 'success'}>
              {isLocked ? (
                <>
                  <Lock className="h-3 w-3" />
                  {f(t.lineup.roundLockedBadge, { round: targetRound })}
                </>
              ) : (
                <>
                  <Unlock className="h-3 w-3" />
                  {f(t.lineup.roundOpenBadge, { round: targetRound })}
                </>
              )}
            </Badge>
            <Button
              variant="outline"
              size="sm"
              disabled={!hasChanges || !lineupQuery.data || isLocked}
              onClick={() => {
                setDraftState(null);
              }}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {t.lineup.restoreBtn}
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={!hasChanges || isLocked || saveMutation.isPending || starterSet.size !== 5}
              onClick={() => {
                saveMutation.mutate();
              }}
            >
              <Save className="h-3.5 w-3.5" />
              {saveMutation.isPending ? t.lineup.savingBtn : t.lineup.saveBtn}
            </Button>
          </div>
        }
      />

      {lineupQuery.isError || rosterQuery.isError ? (
        <ErrorFallbackCard
          title={t.lineup.loadError}
          description={
            (lineupQuery.error instanceof Error ? lineupQuery.error.message : null) ??
            (rosterQuery.error instanceof Error
              ? rosterQuery.error.message
              : t.common.loadErrorDesc)
          }
        />
      ) : lineupQuery.isLoading || rosterQuery.isLoading ? (
        <LoadingSkeletonCard />
      ) : (
        <>
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-3.5 sm:gap-4 sm:pt-5">
              <div>
                <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                  {f(t.lineup.selectedTitle, { teamName: activeLeague.userTeamName })}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {isLocked
                    ? f(t.lineup.lockedWarning, {
                        minutes: lineupQuery.data?.lockMinutesBeforeTipoff ?? 5,
                        round: targetRound,
                      })
                    : t.lineup.injuredWarning}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground uppercase">
                  {t.lineup.projectedAvgLabel}
                </p>
                <p className="font-display text-xl font-bold text-primary tabular-nums sm:text-2xl">
                  {formatStatNumber(projectedAvgDp)} {t.common.dp}
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-5">
            {POSITIONS.map((pos) => {
              const selectedId = starters[pos];
              const selectedPlayer = byId.get(selectedId);
              const candidates = roster.filter((p) => p.position === pos);

              return (
                <Card
                  key={pos}
                  data-testid={`lineup-slot-${pos}`}
                  className={cn(
                    'flex flex-col overflow-hidden bg-gradient-to-b from-card to-surface-deep',
                    selectedPlayer?.status === 'Injured' || selectedPlayer?.status === 'Suspended'
                      ? 'border-amber-500/50'
                      : 'border-primary/35',
                  )}
                >
                  <CardHeader className="border-b border-border/60 bg-surface-elevated/80 px-4 py-3">
                    <div className="flex h-6 items-center justify-between gap-2">
                      <PositionBadge position={pos} />
                      <span className="truncate text-[11px] font-semibold tracking-wider whitespace-nowrap text-muted-foreground uppercase">
                        {t.positions[pos]}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col gap-4 pt-4">
                    {selectedPlayer ? (
                      <div
                        {...getTriggerProps(uiToContextTarget(selectedPlayer))}
                        title={t.lineup.contextHint}
                        className="flex h-[244px] cursor-context-menu flex-col justify-between rounded-lg border border-border/80 bg-surface-deep/85 p-3 transition-colors hover:border-primary/50"
                      >
                        <div>
                          <div className="flex items-center justify-between gap-2">
                            <PlayerAvatar
                              initials={selectedPlayer.initials}
                              name={selectedPlayer.name}
                              seed={selectedPlayer.id}
                              teamCode={selectedPlayer.teamAbbr}
                              highlight
                            />
                            <div className="shrink-0 text-right">
                              <p className="text-[11px] font-medium whitespace-nowrap text-muted-foreground tabular-nums">
                                {formatMillions(selectedPlayer.priceMillions)}
                              </p>
                              <p className="text-xs font-semibold whitespace-nowrap text-foreground tabular-nums">
                                {selectedPlayer.age} {t.common.yearsOld}
                              </p>
                            </div>
                          </div>

                          <div className="mt-2.5 flex h-11 items-center">
                            <p className="line-clamp-2 text-sm leading-tight font-semibold text-foreground">
                              {selectedPlayer.name}
                            </p>
                          </div>

                          <div className="mt-2 flex flex-col items-start gap-2">
                            <RoleBadge role={selectedPlayer.role} />
                            <AvailabilityBadge status={selectedPlayer.status} />
                          </div>
                        </div>

                        <div className="grid grid-cols-4 gap-1.5 rounded-md border border-border/60 bg-surface-elevated px-1.5 py-1.5 text-center">
                          <div>
                            <p className="text-[9px] font-semibold text-muted-foreground uppercase">
                              {t.playerUi.ptsCol}
                            </p>
                            <p className="text-xs font-bold text-foreground tabular-nums">
                              {formatStatNumber(selectedPlayer.stats.pts)}
                            </p>
                          </div>
                          <div>
                            <p className="text-[9px] font-semibold text-muted-foreground uppercase">
                              {t.playerUi.rebCol}
                            </p>
                            <p className="text-xs font-bold text-foreground tabular-nums">
                              {formatStatNumber(selectedPlayer.stats.reb)}
                            </p>
                          </div>
                          <div>
                            <p className="text-[9px] font-semibold text-muted-foreground uppercase">
                              {t.playerUi.astCol}
                            </p>
                            <p className="text-xs font-bold text-foreground tabular-nums">
                              {formatStatNumber(selectedPlayer.stats.ast)}
                            </p>
                          </div>
                          <div>
                            <p className="text-[9px] font-semibold text-primary uppercase">
                              {t.common.dp}
                            </p>
                            <p className="font-display text-xs font-bold text-primary tabular-nums">
                              {formatStatNumber(selectedPlayer.stats.fpPerGame)}
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex h-[244px] items-center justify-center rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                        {f(t.lineup.emptySlot, { pos })}
                      </div>
                    )}

                    <div className="flex-1 space-y-2 border-t border-border/70 pt-3">
                      <p className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                        {f(t.lineup.optionsWithCount, { count: candidates.length })}
                      </p>
                      <div className="space-y-1.5">
                        {candidates.map((candidate) => {
                          const isChosen = candidate.id === selectedId;
                          return (
                            <button
                              key={candidate.id}
                              type="button"
                              aria-pressed={isChosen}
                              disabled={isLocked}
                              {...getTriggerProps(uiToContextTarget(candidate))}
                              onClick={() => {
                                if (!leagueId) return;
                                setDraftState({
                                  leagueId,
                                  map: { ...starters, [pos]: candidate.id },
                                });
                              }}
                              className={cn(
                                'flex w-full cursor-pointer items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-left text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-60',
                                isChosen
                                  ? 'border-primary bg-primary/15 text-foreground'
                                  : 'border-border/70 bg-surface-deep/75 text-muted-foreground hover:border-primary/40 hover:text-foreground',
                              )}
                            >
                              <span className="truncate font-medium">{candidate.name}</span>
                              <span className="shrink-0 font-display font-bold tabular-nums">
                                {formatStatNumber(candidate.stats.fpPerGame)}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
