import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation } from '@tanstack/react-router';
import { ArrowLeftRight, CheckCircle2, Send } from 'lucide-react';
import { useMemo, useState } from 'react';

import { localizeTransferResponseNote, type TransferBlockReason } from '@dream5/shared';

import { PlayerAvatar, PositionBadge, TeamLogo } from '@/components/players/PlayerBadges';
import { dtoToContextTarget, usePlayerContextMenu } from '@/components/players/player-context';
import { NoActiveLeagueCard } from '@/components/shared/EmptyState';
import { ErrorFallbackCard, LoadingSkeletonCard } from '@/components/shared/LoadingErrorStates';
import { PageHeader } from '@/components/shared/PageHeader';
import { TradeOfferCard } from '@/components/transfers/TradeOfferCard';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/toast-context';
import { useDream5State } from '@/hooks/use-dream5-state';
import { useI18n } from '@/hooks/use-i18n';
import { formatExactCreditsFromMillions, formatMillions } from '@/lib/formatters';
import { formatTransferLockBadge } from '@/lib/i18n';
import { teamsApi, transfersApi } from '@/services/dream5-api';
import { mapTransferOfferDtoToUi } from '@/services/mappers';
import type { Position } from '@/types/fantasy';

const ALL_POSITIONS: readonly Position[] = ['PG', 'SG', 'SF', 'PF', 'C'];

export function TransfersPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { getTriggerProps } = usePlayerContextMenu();
  const { activeLeague } = useDream5State();
  const { language, locale, t, f } = useI18n();
  const leagueId = activeLeague?.id ?? null;
  const location = useLocation();

  const initialQuery = useMemo(() => {
    const params = new URLSearchParams(location.searchStr);
    return {
      offerPlayerId: params.get('offerPlayerId'),
      requestPlayerId: params.get('requestPlayerId'),
      targetTeamId: params.get('targetTeamId'),
    };
  }, [location.searchStr]);
  const [prevSearchStr, setPrevSearchStr] = useState(location.searchStr);

  const [targetTeamId, setTargetTeamId] = useState<string | null>(initialQuery.targetTeamId);
  const [offeredIds, setOfferedIds] = useState<string[]>(
    initialQuery.offerPlayerId ? [initialQuery.offerPlayerId] : [],
  );
  const [requestedIds, setRequestedIds] = useState<string[]>(
    initialQuery.requestPlayerId ? [initialQuery.requestPlayerId] : [],
  );
  const [cashOffered, setCashOffered] = useState('');
  const [cashRequested, setCashRequested] = useState('');
  const [message, setMessage] = useState('');

  if (location.searchStr !== prevSearchStr) {
    setPrevSearchStr(location.searchStr);
    if (initialQuery.targetTeamId) {
      setTargetTeamId(initialQuery.targetTeamId);
    }
    if (initialQuery.offerPlayerId) {
      setOfferedIds([initialQuery.offerPlayerId]);
    }
    if (initialQuery.requestPlayerId) {
      setRequestedIds([initialQuery.requestPlayerId]);
    }
  }

  const teamsQuery = useQuery({
    queryKey: ['league', leagueId, 'teams'],
    queryFn: () => teamsApi.list(leagueId ?? ''),
    enabled: leagueId !== null,
  });

  const userTeamQuery = useQuery({
    queryKey: ['league', leagueId, 'team', activeLeague?.userTeamId],
    queryFn: () => teamsApi.detail(leagueId ?? '', activeLeague?.userTeamId ?? ''),
    enabled: leagueId !== null && activeLeague?.userTeamId !== undefined,
  });

  const rivalTeams = (teamsQuery.data ?? []).filter((tm) => tm.id !== activeLeague?.userTeamId);
  const resolvedTargetTeamId = targetTeamId ?? rivalTeams[0]?.id ?? null;

  const targetTeamQuery = useQuery({
    queryKey: ['league', leagueId, 'team', resolvedTargetTeamId],
    queryFn: () => teamsApi.detail(leagueId ?? '', resolvedTargetTeamId ?? ''),
    enabled: leagueId !== null && resolvedTargetTeamId !== null,
  });

  const transfersQuery = useQuery({
    queryKey: ['league', leagueId, 'transfers'],
    queryFn: () => transfersApi.list(leagueId ?? ''),
    enabled: leagueId !== null,
  });

  const invalidateTransferViews = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['league', leagueId, 'transfers'] }),
      queryClient.invalidateQueries({ queryKey: ['league', leagueId, 'team'] }),
      queryClient.invalidateQueries({ queryKey: ['league', leagueId, 'teams'] }),
      queryClient.invalidateQueries({ queryKey: ['league', leagueId, 'lineup'] }),
      queryClient.invalidateQueries({ queryKey: ['leagues'] }),
    ]);
  };

  const parseCashField = (raw: string) => {
    const trimmed = raw.trim().replace(',', '.');
    if (trimmed === '') return 0;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  };

  const createOfferMutation = useMutation({
    mutationFn: () =>
      transfersApi.create(leagueId ?? '', {
        receivingTeamId: resolvedTargetTeamId ?? '',
        offeredPlayerIds: offeredIds,
        requestedPlayerIds: requestedIds,
        cashOfferedMillions: Math.round(parseCashField(cashOffered) * 10) / 10,
        cashRequestedMillions: Math.round(parseCashField(cashRequested) * 10) / 10,
        ...(message.trim() ? { message: message.trim() } : {}),
      }),
    onSuccess: async (res) => {
      setOfferedIds([]);
      setRequestedIds([]);
      setCashOffered('');
      setCashRequested('');
      setMessage('');
      await invalidateTransferViews();
      const tone = res.status === 'REJECTED' ? 'error' : 'success';
      const title =
        res.status === 'ACCEPTED'
          ? t.transfersPage.acceptedToastTitle
          : res.status === 'REJECTED'
            ? t.transfersPage.rejectedToastTitle
            : t.transfersPage.sentToastTitle;
      const localizedNote =
        res.responseNote && res.responseNote.trim().length > 0
          ? localizeTransferResponseNote(res.responseNote, language)
          : null;
      const body =
        localizedNote ??
        (res.status === 'ACCEPTED'
          ? t.transfersPage.tradeAcceptedFallback
          : t.transfersPage.tradeSentFallback);
      showToast({
        tone,
        title,
        message: body,
      });
    },
    onError: (err) => {
      showToast({
        tone: 'error',
        title: t.transfersPage.sendErrTitle,
        message: err instanceof Error ? err.message : t.transfersPage.sendErrFallback,
      });
    },
  });

  const acceptMutation = useMutation({
    mutationFn: (vars: { readonly offerId: string; readonly counterpartyTeam: string }) =>
      transfersApi.accept(leagueId ?? '', vars.offerId),
    onSuccess: async (_res, vars) => {
      await invalidateTransferViews();
      const friendlyMsg =
        language === 'es'
          ? `¡Enhorabuena! Has cerrado el traspaso con ${vars.counterpartyTeam}.`
          : `Congratulations! You closed the trade with ${vars.counterpartyTeam}.`;
      showToast({
        tone: 'success',
        title: t.transfersPage.acceptedToastTitle,
        message: friendlyMsg,
      });
    },
    onError: (err) => {
      showToast({
        tone: 'error',
        message: err instanceof Error ? err.message : t.transfersPage.acceptErrFallback,
      });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (offerId: string) => transfersApi.reject(leagueId ?? '', offerId),
    onSuccess: async () => {
      await invalidateTransferViews();
      showToast({
        tone: 'success',
        title: t.transfersPage.rejectedToastTitle,
        message: t.transfersPage.rejectedToastMsg,
      });
    },
    onError: (err) => {
      showToast({
        tone: 'error',
        message: err instanceof Error ? err.message : t.transfersPage.rejectErrFallback,
      });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (offerId: string) => transfersApi.cancel(leagueId ?? '', offerId),
    onSuccess: async () => {
      await invalidateTransferViews();
      showToast({
        tone: 'success',
        title: t.transfersPage.withdrawnToastTitle,
        message: t.transfersPage.withdrawnToastMsg,
      });
    },
    onError: (err) => {
      showToast({
        tone: 'error',
        message: err instanceof Error ? err.message : t.transfersPage.cancelErrFallback,
      });
    },
  });

  if (!activeLeague) {
    return <NoActiveLeagueCard />;
  }

  const userRoster = userTeamQuery.data?.roster ?? [];
  const targetRoster = targetTeamQuery.data?.roster ?? [];

  const offeredSet = new Set(offeredIds);
  const requestedSet = new Set(requestedIds);

  const offeredPlayers = userRoster.filter((p) => offeredSet.has(p.id));
  const requestedPlayers = targetRoster.filter((p) => requestedSet.has(p.id));

  const offeredPlayersValue = offeredPlayers.reduce((sum, p) => sum + p.priceMillions, 0);
  const requestedPlayersValue = requestedPlayers.reduce((sum, p) => sum + p.priceMillions, 0);
  const cashOut = parseCashField(cashOffered);
  const cashIn = parseCashField(cashRequested);
  const hasInvalidCashOutStep =
    cashOut > 0 &&
    (cashOut + 1e-9 < 0.1 || Math.abs(cashOut * 10 - Math.round(cashOut * 10)) > 1e-4);
  const hasInvalidCashInStep =
    cashIn > 0 && (cashIn + 1e-9 < 0.1 || Math.abs(cashIn * 10 - Math.round(cashIn * 10)) > 1e-4);
  const totalOfferedPackage = offeredPlayersValue + cashOut;
  const totalRequestedPackage = requestedPlayersValue + cashIn;

  const resultingUserRoster = [
    ...userRoster.filter((p) => !offeredSet.has(p.id)),
    ...requestedPlayers,
  ];
  const resultingTargetRoster = [
    ...targetRoster.filter((p) => !requestedSet.has(p.id)),
    ...offeredPlayers,
  ];

  const userMissingPos = ALL_POSITIONS.filter(
    (pos) => !resultingUserRoster.some((p) => p.position === pos),
  );
  const targetMissingPos = ALL_POSITIONS.filter(
    (pos) => !resultingTargetRoster.some((p) => p.position === pos),
  );

  const ruleIssues: string[] = [];
  if (offeredIds.length === 0 || requestedIds.length === 0) {
    ruleIssues.push(t.transfersPage.selectAtLeastOneErr);
  }
  if (offeredIds.length !== requestedIds.length) {
    ruleIssues.push(
      f(t.transfersPage.rosterSizeErr, {
        offered: offeredIds.length,
        requested: requestedIds.length,
      }),
    );
  }
  if (userMissingPos.length > 0) {
    ruleIssues.push(f(t.transfersPage.userPosLossErr, { positions: userMissingPos.join(', ') }));
  }
  if (targetMissingPos.length > 0) {
    ruleIssues.push(
      f(t.transfersPage.targetPosLossErr, { positions: targetMissingPos.join(', ') }),
    );
  }
  if (totalRequestedPackage > 0 && totalOfferedPackage < totalRequestedPackage * 0.5) {
    ruleIssues.push(
      f(t.transfersPage.minValue50Err, {
        offered: formatMillions(totalOfferedPackage),
        required: formatMillions(totalRequestedPackage * 0.5),
      }),
    );
  }
  if (hasInvalidCashOutStep || hasInvalidCashInStep) {
    ruleIssues.push(t.transfersPage.minCashErr);
  }
  if (cashOut > (transfersQuery.data?.userBudgetMillions ?? 0)) {
    ruleIssues.push(t.transfersPage.budgetCashErr);
  }

  const blockedPlayers = transfersQuery.data?.blockedPlayers ?? [];
  const blockedById = new Map(blockedPlayers.map((b) => [b.playerId, b]));
  const selectedBlockedNames = [...offeredPlayers, ...requestedPlayers]
    .filter((p) => blockedById.has(p.id))
    .map((p) => p.name);

  if (selectedBlockedNames.length > 0) {
    ruleIssues.push(
      f(t.transfersPage.lockedSelectionErr, { names: selectedBlockedNames.join(', ') }),
    );
  }

  const offers = (transfersQuery.data?.offers ?? []).map((o) =>
    mapTransferOfferDtoToUi(o, activeLeague.userTeamId, language),
  );
  const incoming = offers.filter((o) => o.bucket === 'incoming');
  const outgoing = offers.filter((o) => o.bucket === 'outgoing');
  const auditHistory = transfersQuery.data?.history ?? [];

  const togglePlayer = (id: string, list: string[], setter: (next: string[]) => void) => {
    setter(list.includes(id) ? list.filter((item) => item !== id) : [...list, id]);
  };

  const formatLockTooltip = (remainingMatches: number, reason: TransferBlockReason) =>
    reason === 'RECENT_TRADE_ACQUISITION'
      ? f(t.transfersPage.lockReasonAcquiredTooltip, { count: remainingMatches })
      : f(t.transfersPage.lockReasonRejectedTooltip, { count: remainingMatches });

  const targetTeamCode = targetTeamQuery.data?.team.code ?? rivalTeams[0]?.code ?? 'LAR';
  const targetTeamName = targetTeamQuery.data?.team.name ?? t.transfersPage.rivalFallback;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t.transfersPage.title}
        description={t.transfersPage.description}
        actions={
          <Badge variant="primary">
            {f(t.transfersPage.budgetAvailableBadge, {
              budget: formatMillions(transfersQuery.data?.userBudgetMillions ?? 0),
            })}
          </Badge>
        }
      />

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 pb-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2">
              <ArrowLeftRight className="h-4 w-4 text-primary" />
              {t.transfersPage.constructorTitle}
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">{t.transfersPage.constructorRules}</p>
          </div>
          <select
            aria-label={t.transfersPage.targetSelectAria}
            value={resolvedTargetTeamId ?? ''}
            onChange={(e) => {
              setTargetTeamId(e.target.value);
              setRequestedIds([]);
            }}
            className="h-9 w-full max-w-full min-w-0 rounded-md border border-border bg-surface-deep px-3 text-sm text-foreground sm:w-auto"
          >
            {rivalTeams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name} ({team.code}) ·{' '}
                {team.isCpuControlled ? t.common.cpuShort : team.managerUsername}
              </option>
            ))}
          </select>
        </CardHeader>

        <CardContent className="space-y-4">
          {userTeamQuery.isLoading || targetTeamQuery.isLoading ? (
            <LoadingSkeletonCard />
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="min-w-0 space-y-2 rounded-lg border border-border bg-surface-deep/75 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <TeamLogo
                      code={activeLeague.userTeamCode}
                      name={activeLeague.userTeamName}
                      size="sm"
                    />
                    <p className="text-xs font-semibold tracking-wider text-foreground uppercase">
                      {f(t.transfersPage.yourSquadOfferTitle, { count: offeredIds.length })}
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-primary tabular-nums">
                    {formatMillions(offeredPlayersValue)}
                  </span>
                </div>
                <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
                  {userRoster.map((player) => {
                    const selected = offeredSet.has(player.id);
                    const blockedInfo = blockedById.get(player.id);
                    return (
                      <button
                        key={player.id}
                        type="button"
                        disabled={blockedInfo !== undefined}
                        title={
                          blockedInfo
                            ? formatLockTooltip(blockedInfo.remainingMatches, blockedInfo.reason)
                            : undefined
                        }
                        {...getTriggerProps(dtoToContextTarget(player))}
                        onClick={() => {
                          togglePlayer(player.id, offeredIds, setOfferedIds);
                        }}
                        className={
                          blockedInfo
                            ? 'flex w-full cursor-not-allowed items-center justify-between gap-2 rounded border border-amber-500/35 bg-amber-500/10 px-2.5 py-1.5 text-left text-xs opacity-75'
                            : selected
                              ? 'flex w-full cursor-pointer items-center justify-between gap-2 rounded border border-primary bg-primary/15 px-2.5 py-1.5 text-left text-xs'
                              : 'flex w-full cursor-pointer items-center justify-between gap-2 rounded border border-border/60 bg-card/65 px-2.5 py-1.5 text-left text-xs hover:border-border'
                        }
                      >
                        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 sm:gap-2">
                          <PlayerAvatar
                            initials={player.initials}
                            name={player.name}
                            seed={player.id}
                            teamCode={player.teamCode}
                            size="sm"
                          />
                          <PositionBadge position={player.position} />
                          <span className="truncate font-medium text-foreground">
                            {player.name}
                          </span>
                          {blockedInfo ? (
                            <Badge variant="warning" className="shrink-0">
                              {formatTransferLockBadge(
                                blockedInfo.remainingMatches,
                                blockedInfo.reason,
                                language,
                              )}
                            </Badge>
                          ) : null}
                        </div>
                        <span className="shrink-0 font-semibold text-muted-foreground tabular-nums">
                          {formatMillions(player.priceMillions)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="min-w-0 space-y-2 rounded-lg border border-border bg-surface-deep/75 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <TeamLogo code={targetTeamCode} name={targetTeamName} size="sm" />
                    <p className="truncate text-xs font-semibold tracking-wider text-foreground uppercase">
                      {f(t.transfersPage.targetSquadRequestTitle, {
                        teamName: targetTeamName,
                        count: requestedIds.length,
                      })}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-semibold text-primary tabular-nums">
                    {formatMillions(requestedPlayersValue)}
                  </span>
                </div>
                <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
                  {targetRoster.map((player) => {
                    const selected = requestedSet.has(player.id);
                    const blockedInfo = blockedById.get(player.id);
                    return (
                      <button
                        key={player.id}
                        type="button"
                        disabled={blockedInfo !== undefined}
                        title={
                          blockedInfo
                            ? formatLockTooltip(blockedInfo.remainingMatches, blockedInfo.reason)
                            : undefined
                        }
                        {...getTriggerProps(dtoToContextTarget(player))}
                        onClick={() => {
                          togglePlayer(player.id, requestedIds, setRequestedIds);
                        }}
                        className={
                          blockedInfo
                            ? 'flex w-full cursor-not-allowed items-center justify-between gap-2 rounded border border-amber-500/35 bg-amber-500/10 px-2.5 py-1.5 text-left text-xs opacity-75'
                            : selected
                              ? 'flex w-full cursor-pointer items-center justify-between gap-2 rounded border border-primary bg-primary/15 px-2.5 py-1.5 text-left text-xs'
                              : 'flex w-full cursor-pointer items-center justify-between gap-2 rounded border border-border/60 bg-card/65 px-2.5 py-1.5 text-left text-xs hover:border-border'
                        }
                      >
                        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 sm:gap-2">
                          <PlayerAvatar
                            initials={player.initials}
                            name={player.name}
                            seed={player.id}
                            teamCode={player.teamCode}
                            size="sm"
                          />
                          <PositionBadge position={player.position} />
                          <span className="truncate font-medium text-foreground">
                            {player.name}
                          </span>
                          {blockedInfo ? (
                            <Badge variant="warning" className="shrink-0">
                              {formatTransferLockBadge(
                                blockedInfo.remainingMatches,
                                blockedInfo.reason,
                                language,
                              )}
                            </Badge>
                          ) : null}
                        </div>
                        <span className="shrink-0 font-semibold text-muted-foreground tabular-nums">
                          {formatMillions(player.priceMillions)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <label htmlFor="cash-offered" className="text-xs font-semibold text-muted-foreground">
                {t.transfersPage.cashOfferedLabel}
              </label>
              <Input
                id="cash-offered"
                type="number"
                min={0}
                step={0.1}
                placeholder={t.transfersPage.cashPlaceholder}
                value={cashOffered}
                onChange={(e) => {
                  setCashOffered(e.target.value);
                }}
              />
              <p className="text-[11px] text-muted-foreground">
                {cashOut > 0
                  ? `${formatMillions(cashOut)} · ${formatExactCreditsFromMillions(cashOut, locale, t.common.creditsShort)}`
                  : t.transfersPage.cashIncrementHint}
              </p>
            </div>
            <div className="space-y-1">
              <label
                htmlFor="cash-requested"
                className="text-xs font-semibold text-muted-foreground"
              >
                {t.transfersPage.cashRequestedLabel}
              </label>
              <Input
                id="cash-requested"
                type="number"
                min={0}
                step={0.1}
                placeholder={t.transfersPage.cashPlaceholder}
                value={cashRequested}
                onChange={(e) => {
                  setCashRequested(e.target.value);
                }}
              />
              <p className="text-[11px] text-muted-foreground">
                {cashIn > 0
                  ? `${formatMillions(cashIn)} · ${formatExactCreditsFromMillions(cashIn, locale, t.common.creditsShort)}`
                  : t.transfersPage.cashIncrementHint}
              </p>
            </div>
            <div className="space-y-1">
              <label
                htmlFor="trade-message"
                className="text-xs font-semibold text-muted-foreground"
              >
                {t.transfersPage.noteLabel}
              </label>
              <Input
                id="trade-message"
                placeholder={t.transfersPage.notePlaceholder}
                value={message}
                onChange={(e) => {
                  setMessage(e.target.value);
                }}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface-deep/80 p-3 text-xs">
            <div className="min-w-0 space-y-1">
              {ruleIssues.length === 0 ? (
                <p className="flex items-center gap-1.5 font-medium text-[var(--tone-success)]">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>
                    {f(t.transfersPage.validPackageMsg, {
                      offered: formatMillions(totalOfferedPackage),
                      requested: formatMillions(totalRequestedPackage),
                    })}
                  </span>
                </p>
              ) : (
                <p className="text-muted-foreground">{t.transfersPage.constructorRules}</p>
              )}
            </div>

            <Button
              variant="primary"
              size="sm"
              disabled={
                offeredIds.length === 0 ||
                requestedIds.length === 0 ||
                createOfferMutation.isPending
              }
              onClick={() => {
                if (ruleIssues.length > 0) {
                  showToast({
                    tone: 'warning',
                    title: t.transfersPage.sendErrTitle,
                    message: ruleIssues.join(' · '),
                  });
                  return;
                }
                createOfferMutation.mutate();
              }}
            >
              <Send className="h-3.5 w-3.5" />
              {createOfferMutation.isPending
                ? t.transfersPage.processingBtn
                : t.transfersPage.sendProposalBtn}
            </Button>
          </div>
        </CardContent>
      </Card>

      {transfersQuery.isError ? (
        <ErrorFallbackCard
          title={t.transfersPage.loadError}
          description={
            transfersQuery.error instanceof Error
              ? transfersQuery.error.message
              : t.common.loadErrorDesc
          }
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="min-w-0 space-y-3">
            <h2 className="font-display text-lg font-bold tracking-wider text-foreground uppercase">
              {f(t.transfersPage.incomingTitle, { count: incoming.length })}
            </h2>
            {incoming.length === 0 ? (
              <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
                {t.transfersPage.noIncoming}
              </p>
            ) : (
              incoming.map((offer) => (
                <TradeOfferCard
                  key={offer.id}
                  offer={offer}
                  resolvedStatus={offer.status}
                  busy={acceptMutation.isPending || rejectMutation.isPending}
                  onAccept={() => {
                    acceptMutation.mutate({
                      offerId: offer.id,
                      counterpartyTeam: offer.counterpartyTeam,
                    });
                  }}
                  onReject={() => {
                    rejectMutation.mutate(offer.id);
                  }}
                />
              ))
            )}
          </div>

          <div className="min-w-0 space-y-3">
            <h2 className="font-display text-lg font-bold tracking-wider text-foreground uppercase">
              {f(t.transfersPage.outgoingTitle, { count: outgoing.length })}
            </h2>
            {outgoing.length === 0 ? (
              <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
                {t.transfersPage.noOutgoing}
              </p>
            ) : (
              outgoing.map((offer) => (
                <TradeOfferCard
                  key={offer.id}
                  offer={offer}
                  resolvedStatus={offer.status}
                  busy={cancelMutation.isPending}
                  onWithdraw={() => {
                    cancelMutation.mutate(offer.id);
                  }}
                />
              ))
            )}
          </div>
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>{f(t.transfersPage.historyTitle, { count: auditHistory.length })}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {auditHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {f(t.transfersPage.noHistory, { leagueName: activeLeague.name })}
            </p>
          ) : (
            auditHistory.map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/80 bg-surface-deep/75 px-3 py-2 text-xs"
              >
                <div className="space-y-1">
                  <p className="font-semibold text-foreground">{item.summary}</p>
                  <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <TeamLogo code={item.fromTeamCode} size="sm" />
                      {item.fromTeamCode} ↔ {item.toTeamCode}
                      <TeamLogo code={item.toTeamCode} size="sm" />
                    </span>
                    {item.movedPlayers.map((p) => (
                      <Badge
                        key={p.id}
                        variant="outline"
                        {...getTriggerProps({
                          id: p.id,
                          name: p.name,
                          position: p.position,
                          role: p.role,
                          priceMillions: p.priceMillions,
                        })}
                        className="cursor-pointer hover:border-primary/50"
                      >
                        {p.name} ({p.position})
                      </Badge>
                    ))}
                  </div>
                </div>
                <span className="text-muted-foreground">
                  {new Date(item.executedAt).toLocaleString(locale)}
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
