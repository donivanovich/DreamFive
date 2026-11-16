import { useQuery } from '@tanstack/react-query';
import { useLocation } from '@tanstack/react-router';
import { LayoutGrid, List, Shield } from 'lucide-react';
import { useMemo, useState } from 'react';

import { TeamLogo } from '@/components/players/PlayerBadges';
import { PlayerCard } from '@/components/players/PlayerCard';
import { PlayerDetailModal } from '@/components/players/PlayerDetailModal';
import { PlayerTable } from '@/components/players/PlayerTable';
import { NoActiveLeagueCard } from '@/components/shared/EmptyState';
import { ErrorFallbackCard, LoadingSkeletonCard } from '@/components/shared/LoadingErrorStates';
import { PageHeader } from '@/components/shared/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { useDream5State } from '@/hooks/use-dream5-state';
import { useI18n } from '@/hooks/use-i18n';
import { formatMillions } from '@/lib/formatters';
import { lineupApi, teamsApi } from '@/services/dream5-api';
import { mapPlayerDtoToUi } from '@/services/mappers';

export function TeamsPage() {
  const { activeLeague, preferences } = useDream5State();
  const { t, f } = useI18n();
  const location = useLocation();
  const urlTeamId = useMemo(
    () => new URLSearchParams(location.searchStr).get('teamId'),
    [location.searchStr],
  );
  const [prevUrlTeamId, setPrevUrlTeamId] = useState(urlTeamId);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(urlTeamId);
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);

  if (urlTeamId !== prevUrlTeamId) {
    setPrevUrlTeamId(urlTeamId);
    setSelectedTeamId(urlTeamId);
  }

  const leagueId = activeLeague?.id ?? null;

  const teamsQuery = useQuery({
    queryKey: ['league', leagueId, 'teams'],
    queryFn: () => teamsApi.list(leagueId ?? ''),
    enabled: leagueId !== null,
  });

  const resolvedTeamId = selectedTeamId ?? activeLeague?.userTeamId ?? null;

  const teamDetailQuery = useQuery({
    queryKey: ['league', leagueId, 'team', resolvedTeamId],
    queryFn: () => teamsApi.detail(leagueId ?? '', resolvedTeamId ?? ''),
    enabled: leagueId !== null && resolvedTeamId !== null,
  });

  const lineupQuery = useQuery({
    queryKey: ['league', leagueId, 'lineup', 'next'],
    queryFn: () => lineupApi.get(leagueId ?? ''),
    enabled: leagueId !== null && resolvedTeamId === activeLeague?.userTeamId,
  });

  if (!activeLeague) {
    return <NoActiveLeagueCard />;
  }

  const starterIds = new Set<string>(
    resolvedTeamId === activeLeague.userTeamId && lineupQuery.data
      ? [
          lineupQuery.data.pgPlayerId,
          lineupQuery.data.sgPlayerId,
          lineupQuery.data.sfPlayerId,
          lineupQuery.data.pfPlayerId,
          lineupQuery.data.cPlayerId,
        ].filter((id): id is string => id !== null)
      : [],
  );

  const uiPlayers = (teamDetailQuery.data?.roster ?? []).map(mapPlayerDtoToUi);
  const teamSummary = teamDetailQuery.data?.team;
  const squadValue = uiPlayers.reduce((sum, p) => sum + p.priceMillions, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t.teams.title}
        description={t.teams.description}
        actions={
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <select
              aria-label={t.teams.selectTeamAria}
              value={resolvedTeamId ?? ''}
              onChange={(e) => {
                setSelectedTeamId(e.target.value);
              }}
              className="h-9 max-w-full min-w-0 flex-1 rounded-md border border-border bg-surface-deep px-3 text-sm text-foreground sm:flex-initial"
            >
              {(teamsQuery.data ?? []).map((team) => (
                <option key={team.id} value={team.id}>
                  #{team.rank} · {team.name} ({team.code})
                  {team.isUserTeam
                    ? ` · ${t.teams.yourTeamTag}`
                    : team.isCpuControlled
                      ? ` · ${t.common.cpuShort}`
                      : ''}
                </option>
              ))}
            </select>
            <div className="flex shrink-0 items-center gap-1.5">
              <Button
                variant={viewMode === 'table' ? 'primary' : 'outline'}
                size="sm"
                aria-label={t.teams.tableViewAria}
                onClick={() => {
                  setViewMode('table');
                }}
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === 'cards' ? 'primary' : 'outline'}
                size="sm"
                aria-label={t.teams.cardsViewAria}
                onClick={() => {
                  setViewMode('cards');
                }}
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
            </div>
          </div>
        }
      />

      {teamDetailQuery.isError ? (
        <ErrorFallbackCard
          title={t.teams.loadError}
          description={
            teamDetailQuery.error instanceof Error
              ? teamDetailQuery.error.message
              : t.common.loadErrorDesc
          }
          onRetry={() => {
            void teamDetailQuery.refetch();
          }}
        />
      ) : teamDetailQuery.isLoading || !teamSummary ? (
        <LoadingSkeletonCard />
      ) : (
        <>
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-5">
              <div className="flex min-w-0 items-center gap-3">
                <TeamLogo code={teamSummary.code} name={teamSummary.name} size="lg" />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate font-display text-xl font-bold tracking-wider text-foreground uppercase">
                      {teamSummary.name}
                    </h2>
                    {!teamSummary.isUserTeam ? (
                      <Badge variant="outline">
                        {teamSummary.isCpuControlled
                          ? t.common.cpuAuto
                          : teamSummary.managerUsername}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {f(t.teams.rankRecord, {
                      rank: teamSummary.rank,
                      wins: teamSummary.wins,
                      losses: teamSummary.losses,
                      dp: teamSummary.totalFantasyPoints.toFixed(1),
                    })}
                  </p>
                </div>
              </div>

              <div className="flex w-full flex-wrap items-center justify-between gap-4 sm:w-auto sm:justify-end sm:gap-6 sm:text-right">
                <div>
                  <p className="text-[11px] text-muted-foreground uppercase">
                    {t.teams.squadValue}
                  </p>
                  <p className="font-display text-xl font-bold text-foreground tabular-nums">
                    {formatMillions(squadValue)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground uppercase">{t.teams.budget}</p>
                  <p className="font-display text-xl font-bold text-primary tabular-nums">
                    {formatMillions(teamSummary.budgetMillions)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground uppercase">
                    {t.teams.playersCount}
                  </p>
                  <p className="flex items-center gap-1 font-display text-xl font-bold text-foreground tabular-nums sm:justify-end">
                    <Shield className="h-4 w-4 text-primary" />
                    {uiPlayers.length}/18
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {viewMode === 'table' ? (
            <PlayerTable
              players={uiPlayers}
              compact={preferences.compactTables}
              showDelta
              starterIds={starterIds}
              onSelectPlayer={(player) => {
                setSelectedPlayerId(player.id);
              }}
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {uiPlayers.map((player) => (
                <PlayerCard
                  key={player.id}
                  player={player}
                  isStarter={starterIds.has(player.id)}
                  showTeam={false}
                  onSelect={(item) => {
                    setSelectedPlayerId(item.id);
                  }}
                />
              ))}
            </div>
          )}
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
