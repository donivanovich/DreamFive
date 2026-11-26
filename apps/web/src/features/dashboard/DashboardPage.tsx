import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Activity, ArrowLeftRight, CalendarClock, Shield, Trophy, UserCheck } from 'lucide-react';
import { useState } from 'react';

import { MarketMoversCard } from '@/components/market/MarketMoversCard';
import { MatchCard } from '@/components/matches/MatchCard';
import { TeamLogo } from '@/components/players/PlayerBadges';
import { PlayerDetailModal } from '@/components/players/PlayerDetailModal';
import { PlayerTable } from '@/components/players/PlayerTable';
import { StandingsTable } from '@/components/rankings/StandingsTable';
import { NoActiveLeagueCard } from '@/components/shared/EmptyState';
import { ErrorFallbackCard, LoadingSkeletonCard } from '@/components/shared/LoadingErrorStates';
import { PageHeader } from '@/components/shared/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { ModalDialog } from '@/components/ui/Dialog';
import { usePlayerContextMenu } from '@/components/players/player-context';
import { useDream5State } from '@/hooks/use-dream5-state';
import { useI18n } from '@/hooks/use-i18n';
import { formatExactCreditsFromMillions, formatMillions, formatStatNumber } from '@/lib/formatters';
import { translateLeagueRole } from '@/lib/i18n';
import {
  lineupApi,
  marketApi,
  matchesApi,
  rankingsApi,
  teamsApi,
  transfersApi,
} from '@/services/dream5-api';
import { mapMatchDtoToUi, mapPlayerDtoToUi, mapStandingDtoToUi } from '@/services/mappers';

export function DashboardPage() {
  const { user, activeLeague, pendingInvitationsCount, isSimulationAdmin } = useDream5State();
  const { language, locale, t, f } = useI18n();
  const { getTriggerProps } = usePlayerContextMenu();
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [showAllTradesModal, setShowAllTradesModal] = useState(false);

  const leagueId = activeLeague?.id ?? null;
  const userTeamId = activeLeague?.userTeamId ?? null;

  const teamDetailQuery = useQuery({
    queryKey: ['league', leagueId, 'team', userTeamId],
    queryFn: () => teamsApi.detail(leagueId ?? '', userTeamId ?? ''),
    enabled: leagueId !== null && userTeamId !== null,
  });

  const lineupQuery = useQuery({
    queryKey: ['league', leagueId, 'lineup', 'next'],
    queryFn: () => lineupApi.get(leagueId ?? ''),
    enabled: leagueId !== null,
  });

  const rankingsQuery = useQuery({
    queryKey: ['league', leagueId, 'rankings'],
    queryFn: () => rankingsApi.get(leagueId ?? ''),
    enabled: leagueId !== null,
  });

  const marketQuery = useQuery({
    queryKey: ['league', leagueId, 'market'],
    queryFn: () => marketApi.get(leagueId ?? ''),
    enabled: leagueId !== null,
  });

  const matchesQuery = useQuery({
    queryKey: ['league', leagueId, 'matches', 'dashboard'],
    queryFn: () => matchesApi.list(leagueId ?? ''),
    enabled: leagueId !== null,
  });

  const transfersQuery = useQuery({
    queryKey: ['league', leagueId, 'transfers'],
    queryFn: () => transfersApi.list(leagueId ?? ''),
    enabled: leagueId !== null,
  });

  if (!activeLeague) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={t.dashboard.titleNoLeague}
          description={
            user ? f(t.dashboard.welcomeNoLeague, { name: user.username, tag: user.tag }) : 'DREAM5'
          }
          actions={
            pendingInvitationsCount > 0 ? (
              <Link to="/leagues">
                <Button variant="primary" size="sm">
                  {f(t.dashboard.pendingInvites, { count: pendingInvitationsCount })}
                </Button>
              </Link>
            ) : undefined
          }
        />
        <NoActiveLeagueCard />
      </div>
    );
  }

  const isLoading =
    teamDetailQuery.isLoading ||
    lineupQuery.isLoading ||
    rankingsQuery.isLoading ||
    marketQuery.isLoading;

  const firstError =
    teamDetailQuery.error ?? lineupQuery.error ?? rankingsQuery.error ?? marketQuery.error;

  const starterIds = new Set<string>(
    lineupQuery.data
      ? [
          lineupQuery.data.pgPlayerId,
          lineupQuery.data.sgPlayerId,
          lineupQuery.data.sfPlayerId,
          lineupQuery.data.pfPlayerId,
          lineupQuery.data.cPlayerId,
        ].filter((id): id is string => id !== null)
      : [],
  );

  const rosterPlayers = (teamDetailQuery.data?.roster ?? []).map(mapPlayerDtoToUi);
  const starterPlayers = rosterPlayers.filter((p) => starterIds.has(p.id));
  const pendingIncomingCount = (transfersQuery.data?.offers ?? []).filter(
    (o) => o.status === 'PENDING' && o.receivingTeamId === activeLeague.userTeamId,
  ).length;

  const standings = (rankingsQuery.data?.standings ?? []).slice(0, 6).map(mapStandingDtoToUi);
  const gainers = (marketQuery.data?.gainers ?? []).slice(0, 3).map(mapPlayerDtoToUi);
  const fallers = (marketQuery.data?.fallers ?? []).slice(0, 3).map(mapPlayerDtoToUi);
  const leagueTrades = transfersQuery.data?.history ?? [];
  const recentLeagueTrades = leagueTrades.slice(0, 4);

  const renderLeagueTradeItem = (item: (typeof leagueTrades)[number]) => (
    <div
      key={item.id}
      className="space-y-1.5 rounded-lg border border-border/80 bg-surface-deep/75 px-2.5 py-2 text-xs sm:px-3 sm:py-2.5"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <TeamLogo code={item.fromTeamCode} name={item.fromTeamName} size="sm" />
          <span className="truncate font-semibold text-foreground sm:hidden">
            {item.fromTeamCode}
          </span>
          <span className="hidden truncate font-semibold text-foreground sm:inline">
            {item.fromTeamName}
          </span>
          <ArrowLeftRight className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span className="truncate font-semibold text-foreground sm:hidden">
            {item.toTeamCode}
          </span>
          <span className="hidden truncate font-semibold text-foreground sm:inline">
            {item.toTeamName}
          </span>
          <TeamLogo code={item.toTeamCode} name={item.toTeamName} size="sm" />
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {Math.abs(item.cashTransferredNet) >= 0.05 ? (
            <Badge variant="primary" className="text-[10px]">
              {formatMillions(Math.abs(item.cashTransferredNet))}
            </Badge>
          ) : null}
          <span className="text-[10px] text-muted-foreground tabular-nums sm:text-[11px]">
            {new Date(item.executedAt).toLocaleString(locale, {
              day: '2-digit',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1">
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
            onClick={(e) => {
              e.stopPropagation();
              setSelectedPlayerId(p.id);
            }}
            className="cursor-pointer hover:border-primary/50"
          >
            {p.name} ({p.position})
          </Badge>
        ))}
      </div>
    </div>
  );

  const userMatches = (matchesQuery.data?.items ?? [])
    .filter(
      (m) => m.homeTeamId === activeLeague.userTeamId || m.awayTeamId === activeLeague.userTeamId,
    )
    .slice(Math.max(0, activeLeague.currentRoundNumber - 2), activeLeague.currentRoundNumber + 2)
    .map((m) => mapMatchDtoToUi(m, language));

  const nextRound = lineupQuery.data?.roundNumber ?? activeLeague.currentRoundNumber + 1;

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title={f(t.dashboard.titleWithLeague, { leagueName: activeLeague.name })}
        description={f(t.dashboard.roleMeta, {
          season: activeLeague.seasonName,
          round: activeLeague.currentRoundNumber,
          total: activeLeague.totalRounds,
          role: translateLeagueRole(activeLeague.userRole, language),
        })}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={lineupQuery.data?.isLocked ? 'warning' : 'success'}>
              {lineupQuery.data?.isLocked
                ? f(t.dashboard.lineupLocked, { round: lineupQuery.data.roundNumber })
                : f(t.dashboard.lineupOpen, { round: nextRound })}
            </Badge>
            <Link to="/lineup">
              <Button variant="primary" size="sm">
                <UserCheck className="h-4 w-4" />
                {t.dashboard.manageLineupBtn}
              </Button>
            </Link>
            {isSimulationAdmin ? (
              <Link to="/simulation">
                <Button variant="outline" size="sm">
                  <Activity className="h-4 w-4" />
                  {t.dashboard.simulationBtn}
                </Button>
              </Link>
            ) : null}
          </div>
        }
      />

      {firstError ? (
        <ErrorFallbackCard
          title={t.dashboard.loadError}
          description={firstError instanceof Error ? firstError.message : t.common.loadErrorDesc}
          onRetry={() => {
            void teamDetailQuery.refetch();
            void rankingsQuery.refetch();
          }}
        />
      ) : null}

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <LoadingSkeletonCard />
          <LoadingSkeletonCard />
          <LoadingSkeletonCard />
          <LoadingSkeletonCard />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-4">
            <Card>
              <CardContent className="pt-3.5 sm:pt-5">
                <div className="flex items-center justify-between gap-1.5 text-[10px] text-muted-foreground sm:text-xs">
                  <span className="truncate font-semibold uppercase">
                    {t.dashboard.franchiseCard}
                  </span>
                  <Shield className="h-3.5 w-3.5 shrink-0 text-primary sm:h-4 sm:w-4" />
                </div>
                <div className="mt-1.5 flex items-center gap-2 sm:mt-2 sm:gap-2.5">
                  <TeamLogo
                    code={activeLeague.userTeamCode}
                    name={activeLeague.userTeamName}
                    size="sm"
                  />
                  <div className="min-w-0">
                    <p className="truncate font-display text-lg font-bold text-foreground uppercase sm:text-2xl">
                      <span className="sm:hidden">{activeLeague.userTeamCode}</span>
                      <span className="hidden sm:inline">{activeLeague.userTeamName}</span>
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground sm:text-xs">
                      {teamDetailQuery.data?.roster.length ?? 18} {t.dashboard.playersCountLabel} ·{' '}
                      {activeLeague.userTeamCode}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-3.5 sm:pt-5">
                <div className="flex items-center justify-between gap-1.5 text-[10px] text-muted-foreground sm:text-xs">
                  <span className="truncate font-semibold uppercase">
                    {t.dashboard.standingsCard}
                  </span>
                  <Trophy className="h-3.5 w-3.5 shrink-0 text-primary sm:h-4 sm:w-4" />
                </div>
                <p className="mt-1.5 font-display text-lg font-bold text-primary tabular-nums sm:mt-2 sm:text-2xl">
                  {f(t.dashboard.rankOf30, { rank: activeLeague.userRank })}
                </p>
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground tabular-nums sm:mt-1 sm:text-xs">
                  {f(t.dashboard.accumulatedDp, { dp: formatStatNumber(activeLeague.userTotalFp) })}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-3.5 sm:pt-5">
                <div className="flex items-center justify-between gap-1.5 text-[10px] text-muted-foreground sm:text-xs">
                  <span className="truncate font-semibold uppercase">{t.dashboard.budgetCard}</span>
                  <CalendarClock className="h-3.5 w-3.5 shrink-0 text-primary sm:h-4 sm:w-4" />
                </div>
                <p className="mt-1.5 font-display text-lg font-bold text-foreground tabular-nums sm:mt-2 sm:text-2xl">
                  {formatMillions(teamDetailQuery.data?.team.budgetMillions ?? 0)}
                </p>
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground tabular-nums sm:mt-1 sm:text-xs">
                  {formatExactCreditsFromMillions(
                    teamDetailQuery.data?.team.budgetMillions ?? 0,
                    locale,
                    t.common.creditsShort,
                  )}
                  {pendingInvitationsCount > 0
                    ? ` · ${f(t.dashboard.inviteShortSuffix, { count: pendingInvitationsCount })}`
                    : ''}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-3.5 sm:pt-5">
                <div className="flex items-center justify-between gap-1.5 text-[10px] text-muted-foreground sm:text-xs">
                  <span className="truncate font-semibold uppercase">
                    {t.dashboard.pendingTradesCard}
                  </span>
                  <ArrowLeftRight className="h-3.5 w-3.5 shrink-0 text-primary sm:h-4 sm:w-4" />
                </div>
                <p className="mt-1.5 font-display text-lg font-bold text-foreground tabular-nums sm:mt-2 sm:text-2xl">
                  {pendingIncomingCount}
                </p>
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground sm:mt-1 sm:text-xs">
                  <Link to="/transfers" className="text-primary hover:underline">
                    {t.dashboard.openTradesLink}
                  </Link>
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 sm:gap-6 xl:grid-cols-[1.35fr_1fr]">
            <Card>
              <CardHeader className="pb-3">
                <div className="min-w-0">
                  <CardTitle>{t.dashboard.scoringFiveTitle}</CardTitle>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {f(t.dashboard.scoringFiveDesc, { round: nextRound })}
                  </p>
                </div>
                <Link to="/lineup">
                  <Button variant="outline" size="sm">
                    {t.dashboard.editBtn}
                  </Button>
                </Link>
              </CardHeader>
              <CardContent>
                <PlayerTable
                  players={starterPlayers.length > 0 ? starterPlayers : rosterPlayers.slice(0, 5)}
                  compact
                  starterIds={starterIds}
                  onSelectPlayer={(player) => {
                    setSelectedPlayerId(player.id);
                  }}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle>
                  {f(t.dashboard.topSixTitle, { leagueName: activeLeague.name })}
                </CardTitle>
                <Link to="/rankings">
                  <Button variant="ghost" size="sm">
                    {t.dashboard.viewAll30}
                  </Button>
                </Link>
              </CardHeader>
              <CardContent>
                <StandingsTable entries={standings} compact />
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <MarketMoversCard title={t.dashboard.biggestGainers} direction="up" players={gainers} />
            <MarketMoversCard
              title={t.dashboard.biggestFallers}
              direction="down"
              players={fallers}
            />
          </div>

          <Card
            role="button"
            tabIndex={0}
            data-testid="dashboard-recent-trades-card"
            onClick={() => {
              setShowAllTradesModal(true);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setShowAllTradesModal(true);
              }
            }}
            className="cursor-pointer transition-colors hover:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
          >
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <ArrowLeftRight className="h-4 w-4 text-primary" />
                {t.dashboard.recentTradesTitle}
              </CardTitle>
              <span className="text-xs font-medium text-primary">
                {f(t.dashboard.recentTradesExpandHint, { count: leagueTrades.length })}
              </span>
            </CardHeader>
            <CardContent className="space-y-2">
              {recentLeagueTrades.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t.dashboard.noLeagueTradesYet}</p>
              ) : (
                recentLeagueTrades.map(renderLeagueTradeItem)
              )}
            </CardContent>
          </Card>

          {userMatches.length > 0 ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg font-bold tracking-wider text-foreground uppercase">
                  {t.dashboard.recentUpcomingMatches}
                </h2>
                <Link to="/matches">
                  <Button variant="ghost" size="sm">
                    {t.dashboard.goMatchCenter}
                  </Button>
                </Link>
              </div>
              <div className="grid gap-2.5 sm:gap-3 md:grid-cols-2">
                {userMatches.map((match) => (
                  <MatchCard key={match.id} match={match} />
                ))}
              </div>
            </div>
          ) : null}
        </>
      )}

      <ModalDialog
        open={showAllTradesModal}
        onClose={() => {
          setShowAllTradesModal(false);
        }}
        title={f(t.dashboard.allLeagueTradesTitle, { count: leagueTrades.length })}
        description={f(t.dashboard.allLeagueTradesDesc, { leagueName: activeLeague.name })}
        contentClassName="max-w-3xl"
      >
        {leagueTrades.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">{t.dashboard.noLeagueTradesYet}</p>
        ) : (
          <div className="max-h-[65vh] space-y-2.5 overflow-y-auto pr-1">
            {leagueTrades.map(renderLeagueTradeItem)}
          </div>
        )}
      </ModalDialog>

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
