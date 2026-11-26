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
import { formatMillions, formatStatNumber } from '@/lib/formatters';
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
              className="h-auto min-h-9 max-w-full min-w-0 flex-1 rounded-md border border-border bg-surface-deep px-2.5 py-1.5 text-xs leading-snug text-foreground sm:h-9 sm:flex-initial sm:px-3 sm:py-0 sm:text-sm"
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
            <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-3.5 sm:gap-4 sm:pt-5">
              <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
                <TeamLogo code={teamSummary.code} name={teamSummary.name} size="md" />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate font-display text-lg font-bold tracking-wider text-foreground uppercase sm:text-xl">
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
                      dp: formatStatNumber(teamSummary.totalFantasyPoints),
                    })}
                  </p>
                </div>
              </div>

              <div className="grid w-full grid-cols-3 gap-2 border-t border-border/60 pt-2.5 text-center sm:flex sm:w-auto sm:items-center sm:justify-end sm:gap-6 sm:border-t-0 sm:pt-0 sm:text-right">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase sm:text-[11px]">
                    {t.teams.squadValue}
                  </p>
                  <p className="font-display text-base font-bold text-foreground tabular-nums sm:text-xl">
                    {formatMillions(squadValue)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase sm:text-[11px]">
                    {t.teams.budget}
                  </p>
                  <p className="font-display text-base font-bold text-primary tabular-nums sm:text-xl">
                    {formatMillions(teamSummary.budgetMillions)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase sm:text-[11px]">
                    {t.teams.playersCount}
                  </p>
                  <p className="flex items-center justify-center gap-1 font-display text-base font-bold text-foreground tabular-nums sm:justify-end sm:text-xl">
                    <Shield className="h-3.5 w-3.5 text-primary sm:h-4 sm:w-4" />
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
            <div className="grid gap-2.5 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
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
