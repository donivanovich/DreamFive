import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Crown, MailPlus, Plus, RefreshCw, Trophy, UserPlus, X } from 'lucide-react';
import { type SyntheticEvent, useState } from 'react';

import { LeagueCard } from '@/components/leagues/LeagueCard';
import { TeamLogo, UserAvatar } from '@/components/players/PlayerBadges';
import { EmptyState } from '@/components/shared/EmptyState';
import { ErrorFallbackCard, LoadingSkeletonCard } from '@/components/shared/LoadingErrorStates';
import { PageHeader } from '@/components/shared/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { ModalDialog } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/toast-context';
import { useDreamFiveState } from '@/hooks/use-dreamfive-state';
import { useI18n } from '@/hooks/use-i18n';
import { formatStatNumber } from '@/lib/formatters';
import { translateInvitationStatus, translateLeagueRole } from '@/lib/i18n';
import { invitationsApi, leaguesApi, seasonsApi, usersApi } from '@/services/dreamfive-api';

export function LeaguesPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const {
    leagues,
    isLeaguesLoading,
    activeLeague,
    setActiveLeagueId,
    refreshSession,
    isSimulationAdmin,
  } = useDreamFiveState();
  const { language, t, f } = useI18n();

  const [createOpen, setCreateOpen] = useState(false);
  const [leagueName, setLeagueName] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteTag, setInviteTag] = useState('');
  const [managerSearch, setManagerSearch] = useState('');

  const hasActivePresidency = leagues.some(
    (l) => l.userRole === 'PRESIDENT' && l.status === 'ACTIVE',
  );

  const pendingInvitationsQuery = useQuery({
    queryKey: ['invitations', 'pending'],
    queryFn: () => invitationsApi.listPending(),
  });

  const activeLeagueDetailQuery = useQuery({
    queryKey: ['league', activeLeague?.id, 'detail'],
    queryFn: () => leaguesApi.detail(activeLeague?.id ?? ''),
    enabled: activeLeague !== null,
  });

  const leagueInvitationsQuery = useQuery({
    queryKey: ['league', activeLeague?.id, 'invitations'],
    queryFn: () => invitationsApi.listByLeague(activeLeague?.id ?? ''),
    enabled: activeLeague !== null && activeLeague.userRole === 'PRESIDENT',
  });

  const managerSearchQuery = useQuery({
    queryKey: ['users', 'search', managerSearch],
    queryFn: () => usersApi.search(managerSearch),
    enabled: inviteOpen && managerSearch.trim().length >= 2,
  });

  const createLeagueMutation = useMutation({
    mutationFn: () =>
      leaguesApi.create({
        name: leagueName.trim(),
        marketMode: 'LEAGUE_ISOLATED',
      }),
    onSuccess: async (res) => {
      setLeagueName('');
      setCreateOpen(false);
      await refreshSession();
      setActiveLeagueId(res.leagueId);
      showToast({
        tone: 'success',
        message: f(t.leagues.createdToast, {
          teamName: res.summary.userTeamName,
          code: res.assignedTeamCode,
        }),
      });
    },
    onError: (err) => {
      showToast({
        tone: 'error',
        message: err instanceof Error ? err.message : t.leagues.createErr,
      });
    },
  });

  const acceptInviteMutation = useMutation({
    mutationFn: (invitationId: string) => invitationsApi.accept(invitationId),
    onSuccess: async (res) => {
      await queryClient.invalidateQueries({ queryKey: ['invitations', 'pending'] });
      await refreshSession();
      setActiveLeagueId(res.leagueId);
      showToast({
        tone: 'success',
        message: f(t.leagues.acceptedToast, {
          teamName: res.assignedTeamName ?? t.leagues.cpuTeamFallback,
          dp: Math.round(res.inheritedPoints ?? 0),
        }),
      });
    },
    onError: (err) => {
      showToast({
        tone: 'error',
        message: err instanceof Error ? err.message : t.leagues.acceptErr,
      });
    },
  });

  const rejectInviteMutation = useMutation({
    mutationFn: (invitationId: string) => invitationsApi.reject(invitationId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['invitations', 'pending'] });
      showToast({ tone: 'success', message: t.leagues.rejectedToast });
    },
  });

  const sendInviteMutation = useMutation({
    mutationFn: (tag: string) => invitationsApi.inviteByTag(activeLeague?.id ?? '', tag),
    onSuccess: async (inv) => {
      setInviteTag('');
      await queryClient.invalidateQueries({
        queryKey: ['league', activeLeague?.id, 'invitations'],
      });
      showToast({
        tone: 'success',
        message: f(t.leagues.inviteSentToast, { tag: inv.invitedTag }),
      });
    },
    onError: (err) => {
      showToast({
        tone: 'error',
        message: err instanceof Error ? err.message : t.leagues.inviteErr,
      });
    },
  });

  const advanceSeasonMutation = useMutation({
    mutationFn: () => seasonsApi.advance(activeLeague?.id ?? ''),
    onSuccess: async () => {
      await refreshSession();
      await queryClient.invalidateQueries({ queryKey: ['league', activeLeague?.id] });
      showToast({
        tone: 'success',
        message: t.leagues.seasonAdvancedToast,
      });
    },
    onError: (err) => {
      showToast({
        tone: 'error',
        message: err instanceof Error ? err.message : t.leagues.seasonAdvanceErr,
      });
    },
  });

  const handleCreateSubmit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (leagueName.trim().length < 3) {
      return;
    }
    createLeagueMutation.mutate();
  };

  const handleInviteSubmit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!inviteTag.trim()) {
      return;
    }
    sendInviteMutation.mutate(inviteTag.trim().toUpperCase());
  };

  const pendingInvitations = pendingInvitationsQuery.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t.leagues.title}
        description={t.leagues.description}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {activeLeague?.userRole === 'PRESIDENT' ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setInviteOpen(true);
                }}
              >
                <MailPlus className="h-4 w-4" />
                {t.leagues.inviteByTagBtn}
              </Button>
            ) : null}
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                if (hasActivePresidency) {
                  showToast({
                    tone: 'error',
                    title: t.leagues.presidencyTooltip,
                    message: t.leagues.presidencyLimitNotice,
                  });
                  return;
                }
                setCreateOpen(true);
              }}
              title={hasActivePresidency ? t.leagues.presidencyTooltip : t.leagues.createTooltip}
            >
              <Plus className="h-4 w-4" />
              {t.leagues.createLeagueBtn}
            </Button>
          </div>
        }
      />

      {pendingInvitations.length > 0 ? (
        <Card className="border-primary/40">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <UserPlus className="h-4 w-4 text-primary" />
              {t.leagues.pendingInvitesTitle} ({pendingInvitations.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {pendingInvitations.map((inv) => (
              <div
                key={inv.id}
                className="flex flex-col justify-between gap-3 rounded-lg border border-border bg-surface-deep/80 p-3.5"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-display text-base font-bold tracking-wider text-foreground uppercase">
                      {inv.leagueName}
                    </p>
                    <Badge variant="warning">
                      {translateInvitationStatus(inv.status, language)}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {f(t.leagues.invitedBy, {
                      name: inv.invitedByUsername,
                      tag: inv.invitedTag,
                    })}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {t.leagues.acceptAssignNote}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={acceptInviteMutation.isPending}
                    onClick={() => {
                      acceptInviteMutation.mutate(inv.id);
                    }}
                  >
                    <Check className="h-3.5 w-3.5" />
                    {t.leagues.acceptAssignBtn}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={rejectInviteMutation.isPending}
                    onClick={() => {
                      rejectInviteMutation.mutate(inv.id);
                    }}
                  >
                    <X className="h-3.5 w-3.5" />
                    {t.leagues.rejectInviteBtn}
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {isLeaguesLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          <LoadingSkeletonCard />
          <LoadingSkeletonCard />
        </div>
      ) : leagues.length === 0 ? (
        <EmptyState
          title={t.leagues.emptyTitle}
          description={t.leagues.emptyDesc}
          actionLabel={t.leagues.emptyAction}
          onAction={() => {
            if (hasActivePresidency) {
              showToast({
                tone: 'error',
                title: t.leagues.presidencyTooltip,
                message: t.leagues.presidencyLimitNotice,
              });
              return;
            }
            setCreateOpen(true);
          }}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {leagues.map((league) => (
            <LeagueCard
              key={league.id}
              league={league}
              isActive={activeLeague?.id === league.id}
              onSelect={setActiveLeagueId}
              onManage={(item) => {
                setActiveLeagueId(item.id);
                if (item.userRole === 'PRESIDENT') {
                  setInviteOpen(true);
                }
              }}
            />
          ))}
        </div>
      )}

      {activeLeague ? (
        <Card>
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 pb-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="h-4 w-4 text-primary" />
                {f(t.leagues.leagueDetailTitle, { leagueName: activeLeague.name })}
              </CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                {activeLeague.participantsCount}/{activeLeague.maxParticipants}{' '}
                {t.leagues.humanParticipants}
              </p>
            </div>
            {isSimulationAdmin && activeLeague.currentRoundNumber >= activeLeague.totalRounds ? (
              <Button
                variant="primary"
                size="sm"
                disabled={advanceSeasonMutation.isPending}
                onClick={() => {
                  advanceSeasonMutation.mutate();
                }}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                {t.leagues.startNextSeasonBtn}
              </Button>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-4">
            {activeLeagueDetailQuery.isError ? (
              <ErrorFallbackCard
                title={t.leagues.detailError}
                description={
                  activeLeagueDetailQuery.error instanceof Error
                    ? activeLeagueDetailQuery.error.message
                    : t.common.loadErrorDesc
                }
              />
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {(activeLeagueDetailQuery.data?.members ?? []).map((member) => (
                  <div
                    key={member.userId}
                    className="flex min-w-0 items-center justify-between gap-2 rounded-md border border-border bg-surface-deep/75 px-2.5 py-2 text-sm sm:px-3 sm:py-2.5"
                  >
                    <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
                      <UserAvatar
                        initials={member.initials}
                        username={member.username}
                        avatarUrl={member.avatarUrl ?? null}
                        size="sm"
                      />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                          <span className="truncate font-semibold text-foreground">
                            {member.username}
                          </span>
                          <span className="text-[11px] text-muted-foreground">{member.tag}</span>
                          <Badge variant={member.role === 'PRESIDENT' ? 'primary' : 'outline'}>
                            {member.role === 'PRESIDENT' ? <Crown className="h-3 w-3" /> : null}
                            {translateLeagueRole(member.role, language)}
                          </Badge>
                        </div>
                        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                          <TeamLogo code={member.teamCode} name={member.teamName} size="sm" />
                          <span className="truncate sm:hidden">{member.teamCode}</span>
                          <span className="hidden truncate sm:inline">
                            {member.teamName} ({member.teamCode})
                          </span>
                        </p>
                      </div>
                    </div>
                    <div className="shrink-0 text-right tabular-nums">
                      <p className="font-display font-bold text-primary">#{member.rank}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatStatNumber(member.fantasyPoints)} {t.common.dp}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeLeague.userRole === 'PRESIDENT' &&
            (leagueInvitationsQuery.data ?? []).length > 0 ? (
              <div>
                <p className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                  {t.leagues.issuedInvitations}
                </p>
                <div className="flex flex-wrap gap-2">
                  {(leagueInvitationsQuery.data ?? []).map((inv) => (
                    <Badge
                      key={inv.id}
                      variant={
                        inv.status === 'ACCEPTED'
                          ? 'success'
                          : inv.status === 'PENDING'
                            ? 'warning'
                            : 'outline'
                      }
                    >
                      {inv.invitedTag} · {translateInvitationStatus(inv.status, language)}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <ModalDialog
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
        }}
        title={t.leagues.createModalTitle}
        description={t.leagues.createModalDesc}
      >
        <form onSubmit={handleCreateSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="new-league-name" className="text-xs font-semibold uppercase">
              {t.leagues.leagueNameLabel}
            </label>
            <Input
              id="new-league-name"
              placeholder={t.leagues.leagueNamePlaceholder}
              value={leagueName}
              onChange={(e) => {
                setLeagueName(e.target.value);
              }}
              minLength={3}
              maxLength={64}
              required
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setCreateOpen(false);
              }}
            >
              {t.common.cancel}
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={createLeagueMutation.isPending}
            >
              {createLeagueMutation.isPending ? t.leagues.creatingBtn : t.leagues.createConfirmBtn}
            </Button>
          </div>
        </form>
      </ModalDialog>

      <ModalDialog
        open={inviteOpen}
        onClose={() => {
          setInviteOpen(false);
        }}
        title={t.leagues.inviteModalTitle}
        description={t.leagues.inviteModalDesc}
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="search-manager" className="text-xs font-semibold uppercase">
              {t.leagues.searchUserLabel}
            </label>
            <Input
              id="search-manager"
              placeholder={t.leagues.searchUserPlaceholder}
              value={managerSearch}
              onChange={(e) => {
                setManagerSearch(e.target.value);
              }}
            />
            {(managerSearchQuery.data ?? []).length > 0 ? (
              <div className="max-h-32 space-y-1 overflow-y-auto rounded-md border border-border bg-surface-deep p-1.5">
                {(managerSearchQuery.data ?? []).map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => {
                      setInviteTag(u.tag);
                    }}
                    className="flex w-full cursor-pointer items-center justify-between gap-2 rounded px-2 py-1 text-left text-xs hover:bg-secondary/60"
                  >
                    <span className="flex items-center gap-2 font-medium text-foreground">
                      <UserAvatar
                        initials={u.initials}
                        username={u.username}
                        avatarUrl={u.avatarUrl}
                        size="sm"
                      />
                      {u.username}
                    </span>
                    <span className="text-primary">{u.tag}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <form onSubmit={handleInviteSubmit} className="space-y-3">
            <div className="space-y-1.5">
              <label htmlFor="invite-tag" className="text-xs font-semibold uppercase">
                {t.leagues.exactTagLabel}
              </label>
              <Input
                id="invite-tag"
                placeholder="#D5-7310"
                value={inviteTag}
                onChange={(e) => {
                  setInviteTag(e.target.value);
                }}
                required
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setInviteOpen(false);
                }}
              >
                {t.common.close}
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={sendInviteMutation.isPending}
              >
                {sendInviteMutation.isPending ? t.leagues.sendingBtn : t.leagues.sendInviteBtn}
              </Button>
            </div>
          </form>
        </div>
      </ModalDialog>
    </div>
  );
}
