import { localizeDisciplineReason, localizeDisqualificationReason } from '@dreamfive/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import {
  AvailabilityBadge,
  PlayerAvatar,
  PositionBadge,
  RoleBadge,
  TeamLogo,
  TrendDeltaBadge,
} from '@/components/players/PlayerBadges';
import { Badge } from '@/components/ui/Badge';
import { ModalDialog } from '@/components/ui/Dialog';
import { useToast } from '@/components/ui/toast-context';
import { useI18n } from '@/hooks/use-i18n';
import { formatMillions, formatStatNumber } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import { playersApi, teamsApi } from '@/services/dreamfive-api';
import { mapPlayerDtoToUi } from '@/services/mappers';

export interface PlayerDetailModalProps {
  readonly leagueId: string | null;
  readonly playerId: string | null;
  readonly onClose: () => void;
}

export function PlayerDetailModal({ leagueId, playerId, onClose }: PlayerDetailModalProps) {
  const { f, language, t } = useI18n();
  const { showToast } = useToast();
  const [prevPropPlayerId, setPrevPropPlayerId] = useState<string | null>(playerId);
  const [overridePlayerId, setOverridePlayerId] = useState<string | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const lastErrorKeyRef = useRef<string | null>(null);

  if (playerId !== prevPropPlayerId) {
    setPrevPropPlayerId(playerId);
    setOverridePlayerId(null);
    setSelectedTeamId(null);
    setSelectedMatchId(null);
  }

  const teamsQuery = useQuery({
    queryKey: ['league', leagueId, 'teams'],
    queryFn: () => teamsApi.list(leagueId ?? ''),
    enabled: leagueId !== null && playerId !== null,
    staleTime: 60_000,
  });

  const pickedTeamQuery = useQuery({
    queryKey: ['league', leagueId, 'teams', selectedTeamId],
    queryFn: () => teamsApi.detail(leagueId ?? '', selectedTeamId ?? ''),
    enabled: leagueId !== null && playerId !== null && selectedTeamId !== null,
    staleTime: 30_000,
  });

  const basePlayerId = overridePlayerId ?? playerId;
  const effectivePlayerId =
    selectedTeamId !== null &&
    pickedTeamQuery.data &&
    !pickedTeamQuery.data.roster.some((p) => p.id === basePlayerId)
      ? (pickedTeamQuery.data.roster[0]?.id ?? basePlayerId)
      : basePlayerId;

  const detailQuery = useQuery({
    queryKey: ['league', leagueId, 'player', effectivePlayerId],
    queryFn: () => playersApi.detail(leagueId ?? '', effectivePlayerId ?? ''),
    enabled: leagueId !== null && effectivePlayerId !== null,
  });

  const activeTeamId = selectedTeamId ?? detailQuery.data?.player.currentTeamId ?? null;

  const teamDetailQuery = useQuery({
    queryKey: ['league', leagueId, 'teams', activeTeamId],
    queryFn: () => teamsApi.detail(leagueId ?? '', activeTeamId ?? ''),
    enabled: leagueId !== null && playerId !== null && activeTeamId !== null,
    staleTime: 30_000,
  });

  const uiPlayer = detailQuery.data ? mapPlayerDtoToUi(detailQuery.data.player) : null;
  const recentStats = detailQuery.data?.recentStats ?? [];
  const selectedStat =
    recentStats.find((s) => s.matchId === selectedMatchId) ?? recentStats[0] ?? null;

  useEffect(() => {
    if (!detailQuery.isError) {
      lastErrorKeyRef.current = null;
      return;
    }
    const msg =
      detailQuery.error instanceof Error ? detailQuery.error.message : t.common.loadErrorTitle;
    const key = `${String(effectivePlayerId)}::${msg}`;
    if (lastErrorKeyRef.current !== key) {
      lastErrorKeyRef.current = key;
      showToast({ tone: 'error', title: t.common.loadErrorTitle, message: msg });
    }
  }, [
    detailQuery.error,
    detailQuery.isError,
    effectivePlayerId,
    showToast,
    t.common.loadErrorTitle,
  ]);

  const formatSignedDp = (val: number): string => {
    const text = formatStatNumber(val);
    return val > 0 && text !== '0' ? `+${text}` : text;
  };

  return (
    <ModalDialog
      open={playerId !== null}
      onClose={onClose}
      contentClassName="max-w-4xl"
      title={uiPlayer ? uiPlayer.name : t.playerUi.detailModalTitle}
      description={
        uiPlayer
          ? `${uiPlayer.teamName} (${uiPlayer.teamAbbr}) · ${String(uiPlayer.age)} ${t.common.yearsOld}`
          : t.playerUi.loadingDetail
      }
    >
      <div className="mb-3 grid gap-2 rounded-lg border border-border bg-surface-deep/75 p-2.5 sm:grid-cols-2">
        <label className="flex min-w-0 flex-col gap-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
          <span>{t.playersPage.selectFranchiseLabel}</span>
          <select
            aria-label={t.playerUi.franchiseSelectAria}
            value={activeTeamId ?? ''}
            onChange={(event) => {
              const nextTeamId = event.target.value;
              setSelectedTeamId(nextTeamId || null);
              setOverridePlayerId(null);
              setSelectedMatchId(null);
            }}
            className="h-9 w-full min-w-0 rounded-md border border-border bg-card px-2.5 text-sm font-medium text-foreground"
          >
            {(teamsQuery.data ?? []).map((team) => (
              <option key={team.id} value={team.id}>
                {team.name} ({team.code})
              </option>
            ))}
          </select>
        </label>

        <label className="flex min-w-0 flex-col gap-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
          <span>{t.playersPage.selectPlayerLabel}</span>
          <select
            aria-label={t.playerUi.playerSelectAria}
            value={
              teamDetailQuery.data?.roster.some((p) => p.id === effectivePlayerId)
                ? (effectivePlayerId ?? '')
                : (teamDetailQuery.data?.roster[0]?.id ?? effectivePlayerId ?? '')
            }
            onChange={(event) => {
              const nextPlayerId = event.target.value;
              if (nextPlayerId) {
                setOverridePlayerId(nextPlayerId);
                setSelectedMatchId(null);
              }
            }}
            className="h-9 w-full min-w-0 rounded-md border border-border bg-card px-2.5 text-sm font-medium text-foreground"
          >
            {teamDetailQuery.data?.roster.map((rosterPlayer) => (
              <option key={rosterPlayer.id} value={rosterPlayer.id}>
                {rosterPlayer.name} ({rosterPlayer.position} · OVR {rosterPlayer.overallRating})
              </option>
            )) ??
              (uiPlayer ? (
                <option value={uiPlayer.id}>
                  {uiPlayer.name} ({uiPlayer.position})
                </option>
              ) : null)}
          </select>
        </label>
      </div>

      {detailQuery.isLoading ? (
        <div className="space-y-3 py-4">
          <div className="h-16 animate-pulse rounded-md bg-secondary/50" />
          <div className="h-40 animate-pulse rounded-md bg-secondary/40" />
        </div>
      ) : detailQuery.isError ? (
        <p className="py-4 text-sm text-muted-foreground">{t.common.loadErrorDesc}</p>
      ) : detailQuery.data && uiPlayer ? (
        <div className="max-h-[65vh] min-w-0 space-y-4 overflow-x-hidden overflow-y-auto overscroll-contain pr-1">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface-deep/80 p-3">
            <div className="flex items-center gap-3">
              <PlayerAvatar
                initials={uiPlayer.initials}
                name={uiPlayer.name}
                seed={uiPlayer.id}
                teamCode={uiPlayer.teamAbbr}
                size="lg"
                highlight
              />
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <TeamLogo code={uiPlayer.teamAbbr} name={uiPlayer.teamName} size="sm" />
                  <PositionBadge position={uiPlayer.position} />
                  <RoleBadge role={uiPlayer.role} />
                  <AvailabilityBadge status={uiPlayer.status} />
                  {detailQuery.data.player.isRetired ? (
                    <Badge variant="outline">{t.playerUi.retiredBadge}</Badge>
                  ) : null}
                </div>
                {uiPlayer.statusNote ? (
                  <p className="text-xs text-muted-foreground">
                    {localizeDisciplineReason(uiPlayer.statusNote, language)}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="text-right">
              <p className="font-display text-xl font-bold text-foreground tabular-nums">
                {formatMillions(uiPlayer.priceMillions)}
              </p>
              <TrendDeltaBadge delta={uiPlayer.priceDeltaMillions} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 rounded-md border border-border bg-surface-deep/60 p-3 text-center text-xs sm:grid-cols-4">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">OVR</p>
              <p className="font-display text-lg font-bold text-primary">
                {detailQuery.data.player.overallRating}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">{t.playerUi.dpPerGame}</p>
              <p className="font-display text-lg font-bold text-foreground tabular-nums">
                {formatStatNumber(uiPlayer.stats.fpPerGame)}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">{t.common.dpTotal}</p>
              <p className="font-display text-lg font-bold text-primary tabular-nums">
                {formatStatNumber(detailQuery.data.player.seasonFantasyPoints)}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">PTS / REB / AST</p>
              <p className="font-semibold text-foreground tabular-nums">
                {formatStatNumber(uiPlayer.stats.pts)} / {formatStatNumber(uiPlayer.stats.reb)} /{' '}
                {formatStatNumber(uiPlayer.stats.ast)}
              </p>
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              {t.playerUi.attributesTitle}
            </p>
            <div className="grid grid-cols-3 gap-2 text-xs sm:grid-cols-6">
              {(
                [
                  [t.playerUi.attrOffense, detailQuery.data.player.offense],
                  [t.playerUi.attrDefense, detailQuery.data.player.defense],
                  [t.playerUi.attrPlaymaking, detailQuery.data.player.playmaking],
                  [t.playerUi.attrRebounding, detailQuery.data.player.rebounding],
                  [t.playerUi.attrAthleticism, detailQuery.data.player.athleticism],
                  [t.playerUi.attrIq, detailQuery.data.player.iq],
                ] as const
              ).map(([label, val]) => (
                <div
                  key={label}
                  className="flex items-center justify-between rounded border border-border/80 bg-surface-deep/50 px-2.5 py-1.5"
                >
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-bold text-foreground tabular-nums">{val}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                {f(t.playerUi.allSeasonGamesTitle, { count: recentStats.length })}
              </p>
              <span className="text-[11px] text-muted-foreground">
                {t.playerUi.matchHistorySubtitle}
              </span>
            </div>

            {recentStats.length === 0 ? (
              <p className="rounded border border-border/70 px-3 py-2 text-xs text-muted-foreground">
                {t.playerUi.noGamesYet}
              </p>
            ) : (
              <div className="space-y-3">
                <div className="dreamfive-table-scroll max-h-64 overflow-y-auto rounded-md border border-border">
                  <table className="w-full min-w-[820px] border-collapse text-left text-xs">
                    <thead className="sticky top-0 z-10 bg-surface-deep text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                      <tr className="border-b border-border">
                        <th className="px-2.5 py-2">{t.common.roundShort}</th>
                        <th className="px-2.5 py-2">{t.playerUi.opponentCol}</th>
                        <th className="px-2 py-2 text-right">{t.playerUi.minCol}</th>
                        <th className="px-2 py-2 text-right">{t.playerUi.ptsCol}</th>
                        <th className="px-2 py-2 text-right">{t.playerUi.rebCol}</th>
                        <th className="px-2 py-2 text-right">{t.playerUi.astCol}</th>
                        <th className="px-2 py-2 text-right">{t.playerUi.stlCol}</th>
                        <th className="px-2 py-2 text-right">{t.playerUi.blkCol}</th>
                        <th className="px-2 py-2 text-right">{t.playerUi.tdCol}</th>
                        <th className="px-2 py-2 text-right">{t.playerUi.tovCol}</th>
                        <th className="px-2 py-2 text-right">{t.playerUi.pfCol}</th>
                        <th className="px-2 py-2 text-right">{t.playerUi.tfCol}</th>
                        <th className="px-2 py-2 text-right">{t.playerUi.ft1Col}</th>
                        <th className="px-2 py-2 text-right">{t.playerUi.ft2Col}</th>
                        <th className="px-2.5 py-2 text-right">{t.playerUi.totalDpCol}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/70">
                      {recentStats.map((stat) => {
                        const isSelected = selectedStat?.matchId === stat.matchId;
                        const venue = stat.isHome ? 'vs' : '@';
                        const scoreStr =
                          stat.teamScore !== null && stat.opponentScore !== null
                            ? `${String(stat.teamScore)}-${String(stat.opponentScore)}`
                            : '—';
                        const dqLabel = stat.disqualificationReason
                          ? localizeDisqualificationReason(stat.disqualificationReason, language)
                          : t.playerUi.ejectedTag;
                        return (
                          <tr
                            key={stat.matchId}
                            onClick={() => {
                              setSelectedMatchId(stat.matchId);
                            }}
                            className={cn(
                              'cursor-pointer transition-colors hover:bg-secondary/45',
                              isSelected && 'bg-primary/[0.08]',
                            )}
                          >
                            <td className="px-2.5 py-1.5 font-medium whitespace-nowrap">
                              <Badge variant={isSelected ? 'primary' : 'outline'}>
                                {t.common.roundShort}
                                {stat.roundNumber}
                              </Badge>
                            </td>
                            <td className="px-2.5 py-1.5 whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                <span className="font-medium text-foreground">
                                  {venue} {stat.opponentTeamCode}
                                </span>
                                <span className="text-[11px] text-muted-foreground tabular-nums">
                                  ({scoreStr})
                                </span>
                                {stat.injured ? (
                                  <Badge variant="danger">{t.playerUi.injuryTag}</Badge>
                                ) : null}
                                {stat.ejected || stat.disqualified ? (
                                  <Badge variant="warning">{dqLabel}</Badge>
                                ) : null}
                              </div>
                            </td>
                            <td className="px-2 py-1.5 text-right tabular-nums">
                              <div>{stat.minutes}</div>
                              <div className="text-[10px] text-muted-foreground">
                                {formatSignedDp(stat.dpBreakdown.minutes)}
                              </div>
                            </td>
                            <td className="px-2 py-1.5 text-right tabular-nums">
                              <div className="font-semibold text-foreground">{stat.pts}</div>
                              <div className="text-[10px] text-muted-foreground">
                                {formatSignedDp(stat.dpBreakdown.pts)}
                              </div>
                            </td>
                            <td className="px-2 py-1.5 text-right tabular-nums">
                              <div className="font-semibold text-foreground">{stat.reb}</div>
                              <div className="text-[10px] text-muted-foreground">
                                {formatSignedDp(stat.dpBreakdown.reb)}
                              </div>
                            </td>
                            <td className="px-2 py-1.5 text-right tabular-nums">
                              <div className="font-semibold text-foreground">{stat.ast}</div>
                              <div className="text-[10px] text-muted-foreground">
                                {formatSignedDp(stat.dpBreakdown.ast)}
                              </div>
                            </td>
                            <td className="px-2 py-1.5 text-right tabular-nums">
                              <div>{stat.stl}</div>
                              <div className="text-[10px] text-muted-foreground">
                                {formatSignedDp(stat.dpBreakdown.stl)}
                              </div>
                            </td>
                            <td className="px-2 py-1.5 text-right tabular-nums">
                              <div>{stat.blk}</div>
                              <div className="text-[10px] text-muted-foreground">
                                {formatSignedDp(stat.dpBreakdown.blk)}
                              </div>
                            </td>
                            <td className="px-2 py-1.5 text-right tabular-nums">
                              <div>{stat.td}</div>
                              <div className="text-[10px] text-muted-foreground">
                                {formatSignedDp(stat.dpBreakdown.td)}
                              </div>
                            </td>
                            <td className="px-2 py-1.5 text-right tabular-nums">
                              <div>{stat.tov}</div>
                              <div className="text-[10px] text-red-400/90">
                                {formatSignedDp(stat.dpBreakdown.tov)}
                              </div>
                            </td>
                            <td className="px-2 py-1.5 text-right tabular-nums">
                              <div>{stat.pf}</div>
                              <div className="text-[10px] text-red-400/90">
                                {formatSignedDp(stat.dpBreakdown.pf)}
                              </div>
                            </td>
                            <td className="px-2 py-1.5 text-right tabular-nums">
                              <div>{stat.tf}</div>
                              <div className="text-[10px] text-red-400/90">
                                {formatSignedDp(stat.dpBreakdown.tf)}
                              </div>
                            </td>
                            <td className="px-2 py-1.5 text-right tabular-nums">
                              <div>{stat.ft1}</div>
                              <div className="text-[10px] text-red-400/90">
                                {formatSignedDp(stat.dpBreakdown.ft1)}
                              </div>
                            </td>
                            <td className="px-2 py-1.5 text-right tabular-nums">
                              <div>{stat.ft2}</div>
                              <div className="text-[10px] text-red-400/90">
                                {formatSignedDp(stat.dpBreakdown.ft2)}
                              </div>
                            </td>
                            <td
                              className={cn(
                                'px-2.5 py-1.5 text-right font-display text-sm font-bold whitespace-nowrap tabular-nums',
                                stat.fantasyPoints < 0
                                  ? 'text-[var(--tone-danger)]'
                                  : 'text-primary',
                              )}
                            >
                              {formatStatNumber(stat.fantasyPoints)} {t.common.dp}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {selectedStat ? (
                  <div className="rounded-md border border-border bg-surface-deep/70 p-3">
                    <p className="mb-2 text-xs font-semibold tracking-wider text-foreground uppercase">
                      {f(t.playerUi.breakdownTitle, {
                        round: selectedStat.roundNumber,
                        matchup: `${selectedStat.isHome ? 'vs' : '@'} ${selectedStat.opponentTeamName}`,
                      })}
                    </p>
                    <div className="dreamfive-table-scroll">
                      <table className="w-full min-w-[460px] border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-border/80 text-[10px] text-muted-foreground uppercase">
                            <th className="py-1 text-left">{t.playerUi.statCol}</th>
                            <th className="py-1 text-right">{t.playerUi.qtyCol}</th>
                            <th className="py-1 text-right">{t.playerUi.weightCol}</th>
                            <th className="py-1 text-right">{t.playerUi.dpEarnedCol}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/50 tabular-nums">
                          {(
                            [
                              [
                                t.playerUi.statMinutes,
                                selectedStat.minutes,
                                t.playerUi.ruleMin,
                                selectedStat.dpBreakdown.minutes,
                              ],
                              [
                                t.playerUi.statPoints,
                                selectedStat.pts,
                                t.playerUi.rulePts,
                                selectedStat.dpBreakdown.pts,
                              ],
                              [
                                t.playerUi.statRebounds,
                                selectedStat.reb,
                                t.playerUi.ruleReb,
                                selectedStat.dpBreakdown.reb,
                              ],
                              [
                                t.playerUi.statAssists,
                                selectedStat.ast,
                                t.playerUi.ruleAst,
                                selectedStat.dpBreakdown.ast,
                              ],
                              [
                                t.playerUi.statSteals,
                                selectedStat.stl,
                                t.playerUi.ruleStl,
                                selectedStat.dpBreakdown.stl,
                              ],
                              [
                                t.playerUi.statBlocks,
                                selectedStat.blk,
                                t.playerUi.ruleBlk,
                                selectedStat.dpBreakdown.blk,
                              ],
                              [
                                t.playerUi.statTripleDouble,
                                selectedStat.td,
                                t.playerUi.ruleTd,
                                selectedStat.dpBreakdown.td,
                              ],
                              [
                                t.playerUi.statTurnovers,
                                selectedStat.tov,
                                t.playerUi.ruleTov,
                                selectedStat.dpBreakdown.tov,
                              ],
                              [
                                t.playerUi.statFouls,
                                selectedStat.pf,
                                t.playerUi.rulePf,
                                selectedStat.dpBreakdown.pf,
                              ],
                              [
                                t.playerUi.statTechnicalFouls,
                                selectedStat.tf,
                                t.playerUi.ruleTf,
                                selectedStat.dpBreakdown.tf,
                              ],
                              [
                                t.playerUi.statFlagrant1,
                                selectedStat.ft1,
                                t.playerUi.ruleFt1,
                                selectedStat.dpBreakdown.ft1,
                              ],
                              [
                                t.playerUi.statFlagrant2,
                                selectedStat.ft2,
                                t.playerUi.ruleFt2,
                                selectedStat.dpBreakdown.ft2,
                              ],
                            ] as const
                          ).map(([label, qty, ruleLabel, dp]) => (
                            <tr key={label}>
                              <td className="py-1 text-foreground">{label}</td>
                              <td className="py-1 text-right font-medium text-foreground">{qty}</td>
                              <td className="py-1 text-right text-muted-foreground">{ruleLabel}</td>
                              <td
                                className={cn(
                                  'py-1 text-right font-semibold',
                                  dp > 0
                                    ? 'text-[var(--tone-success)]'
                                    : dp < 0
                                      ? 'text-[var(--tone-danger)]'
                                      : 'text-muted-foreground',
                                )}
                              >
                                {formatSignedDp(dp)} {t.common.dp}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t border-border font-semibold">
                            <td colSpan={3} className="pt-2 text-left text-foreground">
                              {t.playerUi.totalBreakdownLabel}
                            </td>
                            <td
                              className={cn(
                                'pt-2 text-right tabular-nums',
                                selectedStat.fantasyPoints < 0
                                  ? 'text-[var(--tone-danger)]'
                                  : 'text-primary',
                              )}
                            >
                              {formatSignedDp(selectedStat.fantasyPoints)} {t.common.dp}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>

          {detailQuery.data.marketHistory.length > 0 ? (
            <div>
              <p className="mb-1.5 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                {t.playerUi.valuationHistoryTitle}
              </p>
              <div className="space-y-1">
                {detailQuery.data.marketHistory.slice(0, 4).map((entry, idx) => (
                  <div
                    key={`${entry.recordedAt}-${String(idx)}`}
                    className="flex items-center justify-between rounded border border-border/70 bg-surface-deep/50 px-2.5 py-1 text-xs"
                  >
                    <span className="truncate text-muted-foreground">{entry.reason}</span>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="font-medium text-foreground tabular-nums">
                        {formatMillions(entry.priceMillions)}
                      </span>
                      <TrendDeltaBadge delta={entry.deltaMillions} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </ModalDialog>
  );
}
