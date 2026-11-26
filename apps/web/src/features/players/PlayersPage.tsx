import { useQuery } from '@tanstack/react-query';
import { useLocation } from '@tanstack/react-router';
import { BarChart3, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useMemo, useState } from 'react';

import { PlayerDetailModal } from '@/components/players/PlayerDetailModal';
import { PlayerTable, type PlayerTableSortKey } from '@/components/players/PlayerTable';
import { EmptyState, NoActiveLeagueCard } from '@/components/shared/EmptyState';
import { ErrorFallbackCard, LoadingSkeletonCard } from '@/components/shared/LoadingErrorStates';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useDream5State } from '@/hooks/use-dream5-state';
import { useI18n } from '@/hooks/use-i18n';
import type { SortState } from '@/lib/table-sort';
import { playersApi, teamsApi } from '@/services/dream5-api';
import { mapPlayerDtoToUi, UI_AVAILABILITY_TO_SHARED, UI_ROLE_TO_SHARED } from '@/services/mappers';
import type { AvailabilityStatus, PlayerRole, Position } from '@/types/fantasy';

const PAGE_SIZE = 30;
const POSITIONS: readonly ('ALL' | Position)[] = ['ALL', 'PG', 'SG', 'SF', 'PF', 'C'];
const ROLES: readonly ('ALL' | PlayerRole)[] = [
  'ALL',
  'Superestrella',
  'Estrella',
  'Inicial',
  'Rotación',
  'Rookie',
  'Calientabanquillos',
];
const STATUSES: readonly ('ALL' | AvailabilityStatus)[] = [
  'ALL',
  'Healthy',
  'Questionable',
  'Injured',
  'Suspended',
];

export function PlayersPage() {
  const { activeLeague, preferences } = useDream5State();
  const { t, f } = useI18n();
  const leagueId = activeLeague?.id ?? null;
  const location = useLocation();
  const urlSearch = useMemo(
    () => new URLSearchParams(location.searchStr).get('search') ?? '',
    [location.searchStr],
  );
  const [prevUrlSearch, setPrevUrlSearch] = useState(urlSearch);

  const [search, setSearch] = useState(urlSearch);
  const [teamFilterId, setTeamFilterId] = useState<string>('ALL');
  const [scoutTeamId, setScoutTeamId] = useState<string>('');
  const [scoutPlayerId, setScoutPlayerId] = useState<string>('');
  const [position, setPosition] = useState<'ALL' | Position>('ALL');
  const [role, setRole] = useState<'ALL' | PlayerRole>('ALL');
  const [status, setStatus] = useState<'ALL' | AvailabilityStatus>('ALL');
  const [defaultSortBy, setDefaultSortBy] = useState<'fp' | 'price' | 'overall'>('fp');
  const [tableSort, setTableSort] = useState<SortState<PlayerTableSortKey> | null>(null);
  const [offset, setOffset] = useState(0);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);

  if (urlSearch !== prevUrlSearch) {
    setPrevUrlSearch(urlSearch);
    setSearch(urlSearch);
    setOffset(0);
  }

  const effectiveSortBy = tableSort?.key ?? defaultSortBy;
  const effectiveSortDir = tableSort?.dir ?? 'desc';

  const teamsQuery = useQuery({
    queryKey: ['league', leagueId, 'teams'],
    queryFn: () => teamsApi.list(leagueId ?? ''),
    enabled: leagueId !== null,
    staleTime: 60_000,
  });

  const effectiveScoutTeamId =
    (scoutTeamId.length > 0 ? scoutTeamId : null) ??
    teamsQuery.data?.find((team) => team.isUserTeam)?.id ??
    teamsQuery.data?.[0]?.id ??
    '';

  const scoutRosterQuery = useQuery({
    queryKey: ['league', leagueId, 'teams', effectiveScoutTeamId],
    queryFn: () => teamsApi.detail(leagueId ?? '', effectiveScoutTeamId),
    enabled: leagueId !== null && effectiveScoutTeamId.length > 0,
    staleTime: 30_000,
  });

  const effectiveScoutPlayerId = scoutRosterQuery.data?.roster.some((p) => p.id === scoutPlayerId)
    ? scoutPlayerId
    : (scoutRosterQuery.data?.roster[0]?.id ?? '');

  const playersQuery = useQuery({
    queryKey: [
      'league',
      leagueId,
      'players',
      search,
      teamFilterId,
      position,
      role,
      status,
      effectiveSortBy,
      effectiveSortDir,
      offset,
    ],
    queryFn: () =>
      playersApi.list(leagueId ?? '', {
        ...(search.trim() ? { search: search.trim() } : {}),
        ...(teamFilterId !== 'ALL' ? { teamId: teamFilterId } : {}),
        ...(position !== 'ALL' ? { position } : {}),
        ...(role !== 'ALL' ? { role: UI_ROLE_TO_SHARED[role] } : {}),
        ...(status !== 'ALL' ? { status: UI_AVAILABILITY_TO_SHARED[status] } : {}),
        sortBy: effectiveSortBy,
        sortDir: effectiveSortDir,
        limit: PAGE_SIZE,
        offset,
      }),
    enabled: leagueId !== null,
  });

  if (!activeLeague) {
    return <NoActiveLeagueCard />;
  }

  const total = playersQuery.data?.total ?? 0;
  const players = (playersQuery.data?.items ?? []).map(mapPlayerDtoToUi);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t.playersPage.title}
        description={f(t.playersPage.description, { leagueName: activeLeague.name })}
      />

      <div className="rounded-lg border border-border bg-card p-3.5 sm:p-5">
        <div className="flex flex-col gap-3 sm:gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 flex-1 space-y-0.5 text-left sm:space-y-1">
            <p className="text-xs font-semibold tracking-wider text-primary uppercase">
              {t.playersPage.quickScoutTitle}
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t.playersPage.quickScoutDesc}
            </p>
          </div>
          <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1.25fr)_minmax(0,1.25fr)_auto] sm:gap-3 lg:w-auto lg:max-w-[700px] lg:min-w-[600px] lg:shrink-0">
            <label className="flex min-w-0 flex-col gap-1 text-[11px] font-medium text-muted-foreground">
              <span className="truncate">{t.playersPage.selectFranchiseLabel}</span>
              <select
                aria-label={t.playersPage.selectFranchiseLabel}
                value={effectiveScoutTeamId}
                onChange={(e) => {
                  const nextId = e.target.value;
                  setScoutTeamId(nextId);
                  setScoutPlayerId('');
                }}
                className="h-9 w-full min-w-0 rounded-md border border-border bg-surface-deep px-2 text-xs text-foreground sm:px-2.5 sm:text-sm"
              >
                {(teamsQuery.data ?? []).map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name} ({team.code})
                  </option>
                ))}
              </select>
            </label>

            <label className="flex min-w-0 flex-col gap-1 text-[11px] font-medium text-muted-foreground">
              <span className="truncate">{t.playersPage.selectPlayerLabel}</span>
              <select
                aria-label={t.playersPage.selectPlayerLabel}
                value={effectiveScoutPlayerId}
                onChange={(e) => {
                  setScoutPlayerId(e.target.value);
                }}
                className="h-9 w-full min-w-0 rounded-md border border-border bg-surface-deep px-2 text-xs text-foreground sm:px-2.5 sm:text-sm"
              >
                {(scoutRosterQuery.data?.roster ?? []).map((rosterPlayer) => (
                  <option key={rosterPlayer.id} value={rosterPlayer.id}>
                    {rosterPlayer.name} ({rosterPlayer.position})
                  </option>
                ))}
              </select>
            </label>

            <div className="col-span-2 flex items-end sm:col-span-1">
              <Button
                type="button"
                className="w-full"
                disabled={!effectiveScoutPlayerId}
                onClick={() => {
                  if (effectiveScoutPlayerId) {
                    setSelectedPlayerId(effectiveScoutPlayerId);
                  }
                }}
              >
                <BarChart3 className="h-4 w-4" />
                {t.playersPage.viewStatsBtn}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-card p-3 sm:gap-3 sm:p-4 md:grid-cols-7">
        <div className="relative col-span-2 min-w-0">
          <Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t.playersPage.searchPlaceholder}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setOffset(0);
            }}
            className="pl-9"
          />
        </div>

        <select
          aria-label={t.playersPage.filterFranchiseAria}
          value={teamFilterId}
          onChange={(e) => {
            setTeamFilterId(e.target.value);
            setOffset(0);
          }}
          className="h-9 w-full min-w-0 rounded-md border border-border bg-surface-deep px-2 text-xs text-foreground sm:px-2.5 sm:text-sm"
        >
          <option value="ALL">{t.playersPage.allFranchises}</option>
          {(teamsQuery.data ?? []).map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>

        <select
          aria-label={t.playersPage.filterPosAria}
          value={position}
          onChange={(e) => {
            setPosition(e.target.value as 'ALL' | Position);
            setOffset(0);
          }}
          className="h-9 w-full min-w-0 rounded-md border border-border bg-surface-deep px-2 text-xs text-foreground sm:px-2.5 sm:text-sm"
        >
          {POSITIONS.map((pos) => (
            <option key={pos} value={pos}>
              {pos === 'ALL' ? t.playersPage.allPositions : pos}
            </option>
          ))}
        </select>

        <select
          aria-label={t.playersPage.filterRoleAria}
          value={role}
          onChange={(e) => {
            setRole(e.target.value as 'ALL' | PlayerRole);
            setOffset(0);
          }}
          className="h-9 w-full min-w-0 rounded-md border border-border bg-surface-deep px-2 text-xs text-foreground sm:px-2.5 sm:text-sm"
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r === 'ALL' ? t.playersPage.allRoles : t.roles[r]}
            </option>
          ))}
        </select>

        <select
          aria-label={t.playersPage.filterStatusAria}
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as 'ALL' | AvailabilityStatus);
            setOffset(0);
          }}
          className="h-9 w-full min-w-0 rounded-md border border-border bg-surface-deep px-2 text-xs text-foreground sm:px-2.5 sm:text-sm"
        >
          {STATUSES.map((st) => (
            <option key={st} value={st}>
              {st === 'ALL' ? t.playersPage.allStatuses : t.availability[st]}
            </option>
          ))}
        </select>

        <select
          aria-label={t.playersPage.sortByAria}
          value={defaultSortBy}
          onChange={(e) => {
            setDefaultSortBy(e.target.value as 'fp' | 'price' | 'overall');
            setTableSort(null);
            setOffset(0);
          }}
          className="col-span-2 h-9 w-full min-w-0 rounded-md border border-border bg-surface-deep px-2 text-xs text-foreground sm:px-2.5 sm:text-sm md:col-span-1"
        >
          <option value="fp">{t.playersPage.sortByFp}</option>
          <option value="price">{t.playersPage.sortByPrice}</option>
          <option value="overall">{t.playersPage.sortByOvr}</option>
        </select>
      </div>

      {playersQuery.isError ? (
        <ErrorFallbackCard
          title={t.playersPage.loadError}
          description={
            playersQuery.error instanceof Error
              ? playersQuery.error.message
              : t.common.loadErrorDesc
          }
        />
      ) : playersQuery.isLoading ? (
        <LoadingSkeletonCard />
      ) : players.length === 0 ? (
        <EmptyState
          title={t.playersPage.emptyTitle}
          description={t.playersPage.emptyDesc}
          actionLabel={t.playersPage.clearFilters}
          onAction={() => {
            setSearch('');
            setTeamFilterId('ALL');
            setPosition('ALL');
            setRole('ALL');
            setStatus('ALL');
            setTableSort(null);
            setOffset(0);
          }}
        />
      ) : (
        <>
          <PlayerTable
            players={players}
            compact={preferences.compactTables}
            showTeam
            showDelta
            sort={tableSort}
            onSortChange={(next) => {
              setTableSort(next);
              setOffset(0);
            }}
            onSelectPlayer={(player) => {
              setSelectedPlayerId(player.id);
            }}
          />

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              {f(t.playersPage.showingRange, {
                from: offset + 1,
                to: Math.min(offset + PAGE_SIZE, total),
                total,
              })}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={offset === 0}
                onClick={() => {
                  setOffset((prev) => Math.max(0, prev - PAGE_SIZE));
                }}
              >
                <ChevronLeft className="h-4 w-4" />
                {t.playersPage.prevBtn}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={offset + PAGE_SIZE >= total}
                onClick={() => {
                  setOffset((prev) => prev + PAGE_SIZE);
                }}
              >
                {t.playersPage.nextBtn}
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
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
