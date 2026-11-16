import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import {
  Camera,
  Check,
  Crown,
  KeyRound,
  Mail,
  Pencil,
  ShieldCheck,
  Trash2,
  Trophy,
  UserRound,
  UserX,
  X,
} from 'lucide-react';
import { type ChangeEvent, type SyntheticEvent, useRef, useState } from 'react';

import { TeamLogo, UserAvatar } from '@/components/players/PlayerBadges';
import { PageHeader } from '@/components/shared/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { ModalDialog } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { useToast } from '@/components/ui/toast-context';
import { useDream5State } from '@/hooks/use-dream5-state';
import { useI18n } from '@/hooks/use-i18n';
import { formatMillions } from '@/lib/formatters';
import { translateLeagueRole } from '@/lib/i18n';
import { usersApi } from '@/services/dream5-api';

export function ProfilePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { user, leagues, refreshSession } = useDream5State();
  const { language, locale, t, f } = useI18n();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [isEditingName, setIsEditingName] = useState(false);
  const [username, setUsername] = useState(user?.username ?? '');
  const [newEmail, setNewEmail] = useState('');
  const [emailChangePassword, setEmailChangePassword] = useState('');
  const [emailChangeCode, setEmailChangeCode] = useState('');
  const [requestedPendingEmail, setRequestedPendingEmail] = useState<string | null>(null);
  const [deleteStep, setDeleteStep] = useState<0 | 1 | 2 | 3>(0);
  const [confirmDeleteUsername, setConfirmDeleteUsername] = useState('');
  const [successorSelections, setSuccessorSelections] = useState<Record<string, string>>({});

  const [syncedUserId, setSyncedUserId] = useState<string | null>(user?.id ?? null);
  if (user && user.id !== syncedUserId) {
    setSyncedUserId(user.id);
    setUsername(user.username);
    setIsEditingName(false);
  }

  const invalidateUserViews = async () => {
    await Promise.all([refreshSession(), queryClient.invalidateQueries({ queryKey: ['league'] })]);
  };

  const deletionContextQuery = useQuery({
    queryKey: ['users', 'me', 'deletion-context'],
    queryFn: () => usersApi.deletionContext(),
    enabled: deleteStep === 3 && user !== null,
    staleTime: 0,
  });

  const updateNameMutation = useMutation({
    mutationFn: () => usersApi.updateProfile({ username: username.trim() }),
    onSuccess: async (updatedUser) => {
      queryClient.setQueryData(['auth', 'me'], updatedUser);
      setIsEditingName(false);
      await invalidateUserViews();
      showToast({ tone: 'success', message: t.profile.nameSavedToast });
    },
    onError: (err) => {
      showToast({
        tone: 'error',
        message: err instanceof Error ? err.message : t.common.loadErrorTitle,
      });
    },
  });

  const uploadAvatarMutation = useMutation({
    mutationFn: (file: File) => usersApi.uploadAvatar(file),
    onSuccess: async (updatedUser) => {
      queryClient.setQueryData(['auth', 'me'], updatedUser);
      await invalidateUserViews();
      showToast({ tone: 'success', message: t.profile.photoUpdatedToast });
    },
    onError: (err) => {
      showToast({
        tone: 'error',
        message: err instanceof Error ? err.message : t.common.loadErrorTitle,
      });
    },
  });

  const removeAvatarMutation = useMutation({
    mutationFn: () => usersApi.removeAvatar(),
    onSuccess: async (updatedUser) => {
      queryClient.setQueryData(['auth', 'me'], updatedUser);
      await invalidateUserViews();
      showToast({ tone: 'success', message: t.profile.photoRemovedToast });
    },
    onError: (err) => {
      showToast({
        tone: 'error',
        message: err instanceof Error ? err.message : t.common.loadErrorTitle,
      });
    },
  });

  const requestEmailChangeMutation = useMutation({
    mutationFn: () =>
      usersApi.requestEmailChange({
        newEmail: newEmail.trim(),
        currentPassword: emailChangePassword,
      }),
    onSuccess: async (res) => {
      setRequestedPendingEmail(res.pendingEmail);
      setEmailChangePassword('');
      setEmailChangeCode('');
      await refreshSession();
      showToast({ tone: 'info', message: t.profile.emailCodeSentToast });
    },
    onError: (err) => {
      showToast({
        tone: 'error',
        message: err instanceof Error ? err.message : t.common.loadErrorTitle,
      });
    },
  });

  const confirmEmailChangeMutation = useMutation({
    mutationFn: () => usersApi.confirmEmailChange({ code: emailChangeCode.trim() }),
    onSuccess: async (updatedUser) => {
      setRequestedPendingEmail(null);
      setNewEmail('');
      setEmailChangeCode('');
      queryClient.setQueryData(['auth', 'me'], updatedUser);
      await invalidateUserViews();
      showToast({ tone: 'success', message: t.profile.emailUpdatedToast });
    },
    onError: (err) => {
      showToast({
        tone: 'error',
        message: err instanceof Error ? err.message : t.common.loadErrorTitle,
      });
    },
  });

  const requestPasswordResetMutation = useMutation({
    mutationFn: () => usersApi.requestPasswordReset(),
    onSuccess: (res) => {
      showToast({
        tone: 'success',
        message: `${t.profile.resetSentPrefix} ${res.email}`,
      });
    },
    onError: (err) => {
      showToast({
        tone: 'error',
        message: err instanceof Error ? err.message : t.common.loadErrorTitle,
      });
    },
  });

  const resetDeleteFlow = () => {
    setDeleteStep(0);
    setConfirmDeleteUsername('');
    setSuccessorSelections({});
  };

  const deleteAccountMutation = useMutation({
    mutationFn: (payload: {
      readonly confirmUsername: string;
      readonly successorPresidents: Record<string, string>;
    }) => usersApi.deleteAccount(payload),
    onSuccess: async () => {
      resetDeleteFlow();
      queryClient.clear();
      await refreshSession();
      showToast({ tone: 'success', message: t.profile.deleteSuccessToast });
      await navigate({ to: '/auth' });
    },
    onError: (err) => {
      showToast({
        tone: 'error',
        message: err instanceof Error ? err.message : t.common.loadErrorTitle,
      });
    },
  });

  if (!user) {
    return null;
  }

  const activePendingEmail = requestedPendingEmail ?? user.pendingEmail;
  const presidedLeaguesForDelete = deletionContextQuery.data?.presidedLeagues ?? [];
  const resolvedSuccessorMap: Record<string, string> = {};
  for (const league of presidedLeaguesForDelete) {
    if (league.candidates.length > 0) {
      resolvedSuccessorMap[league.leagueId] =
        successorSelections[league.leagueId] ?? league.candidates[0]?.userId ?? '';
    }
  }
  const hasAllRequiredSuccessors = presidedLeaguesForDelete.every(
    (league) => league.candidates.length === 0 || Boolean(resolvedSuccessorMap[league.leagueId]),
  );

  const handleAvatarSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }
    uploadAvatarMutation.mutate(file);
  };

  const handleNameSubmit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = username.trim();
    if (trimmed.length < 3) {
      return;
    }
    if (trimmed === user.username) {
      setIsEditingName(false);
      return;
    }
    updateNameMutation.mutate();
  };

  const handleDeleteFinalSubmit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (confirmDeleteUsername !== user.username || !hasAllRequiredSuccessors) {
      return;
    }
    deleteAccountMutation.mutate({
      confirmUsername: confirmDeleteUsername,
      successorPresidents: resolvedSuccessorMap,
    });
  };

  const handleEmailRequestSubmit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newEmail.trim() || !emailChangePassword) {
      return;
    }
    requestEmailChangeMutation.mutate();
  };

  const handleEmailConfirmSubmit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (emailChangeCode.trim().length !== 6) {
      return;
    }
    confirmEmailChangeMutation.mutate();
  };

  return (
    <div className="space-y-6">
      <PageHeader title={t.profile.title} description={t.profile.description} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserRound className="h-4 w-4 text-primary" />
              {t.profile.photoCardTitle}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-4">
              <UserAvatar
                initials={user.initials}
                username={user.username}
                avatarUrl={user.avatarUrl}
                size="lg"
              />
              <div className="min-w-0 flex-1">
                {isEditingName ? (
                  <form onSubmit={handleNameSubmit} className="flex items-center gap-1.5">
                    <Input
                      id="profile-inline-username"
                      value={username}
                      onChange={(event) => {
                        setUsername(event.target.value);
                      }}
                      minLength={3}
                      maxLength={32}
                      required
                      autoFocus
                      className="h-8 min-w-0 flex-1 text-sm"
                    />
                    <button
                      type="submit"
                      aria-label={t.profile.saveUsernameAria}
                      disabled={updateNameMutation.isPending || username.trim().length < 3}
                      className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md border border-emerald-500/40 bg-emerald-500/15 text-[var(--tone-success)] transition-colors hover:bg-emerald-500/25 disabled:opacity-50"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      aria-label={t.profile.cancelUsernameAria}
                      onClick={() => {
                        setUsername(user.username);
                        setIsEditingName(false);
                      }}
                      className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md border border-border bg-secondary/70 text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </form>
                ) : (
                  <div className="flex items-center gap-2">
                    <p className="truncate font-display text-xl font-bold tracking-wide text-foreground">
                      {user.username}
                    </p>
                    <button
                      type="button"
                      aria-label={t.profile.editUsernameAria}
                      onClick={() => {
                        setUsername(user.username);
                        setIsEditingName(true);
                      }}
                      className="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md border border-border bg-surface-deep text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <Badge variant="primary">{user.tag}</Badge>
                  <Badge variant="outline">{user.role}</Badge>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-surface-deep/80 p-3.5 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-muted-foreground">{t.profile.currentEmailLabel}</span>
                <span className="font-medium break-all text-foreground">{user.email}</span>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                <span className="text-muted-foreground">{t.profile.uniqueTagLabel}</span>
                <span className="font-semibold text-primary tabular-nums">{user.tag}</span>
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleAvatarSelected}
              className="hidden"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={uploadAvatarMutation.isPending}
                onClick={() => {
                  fileInputRef.current?.click();
                }}
              >
                <Camera className="h-3.5 w-3.5" />
                {uploadAvatarMutation.isPending
                  ? t.profile.uploadingPhotoBtn
                  : t.profile.uploadPhotoBtn}
              </Button>
              {user.avatarUrl ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={removeAvatarMutation.isPending}
                  onClick={() => {
                    removeAvatarMutation.mutate();
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {t.profile.removePhotoBtn}
                </Button>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">{t.profile.photoHint}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              {t.profile.accountCardTitle}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-3 border-b border-border pb-4">
              <div className="flex items-center gap-2 text-xs font-semibold tracking-wider text-foreground uppercase">
                <Mail className="h-3.5 w-3.5 text-primary" />
                {t.profile.emailSectionTitle}
              </div>

              {activePendingEmail ? (
                <div className="space-y-3 rounded-lg border border-primary/35 bg-primary/10 p-3">
                  <p className="text-xs text-foreground">
                    <span className="font-semibold text-primary">
                      {t.profile.pendingEmailLabel}:{' '}
                    </span>
                    {activePendingEmail}
                  </p>
                  <form onSubmit={handleEmailConfirmSubmit} className="flex items-end gap-2">
                    <div className="flex-1 space-y-1">
                      <label
                        htmlFor="email-change-code"
                        className="text-[11px] font-semibold text-muted-foreground uppercase"
                      >
                        {t.profile.emailCodeLabel}
                      </label>
                      <Input
                        id="email-change-code"
                        inputMode="numeric"
                        maxLength={6}
                        placeholder="123456"
                        value={emailChangeCode}
                        onChange={(event) => {
                          setEmailChangeCode(event.target.value.replace(/\D/g, '').slice(0, 6));
                        }}
                        required
                      />
                    </div>
                    <Button
                      type="submit"
                      variant="primary"
                      size="sm"
                      disabled={
                        confirmEmailChangeMutation.isPending || emailChangeCode.trim().length !== 6
                      }
                    >
                      <Check className="h-3.5 w-3.5" />
                      {confirmEmailChangeMutation.isPending
                        ? t.profile.confirmingEmailBtn
                        : t.profile.confirmEmailBtn}
                    </Button>
                  </form>
                </div>
              ) : null}

              <form onSubmit={handleEmailRequestSubmit} className="space-y-2.5">
                <div className="space-y-1">
                  <label
                    htmlFor="profile-new-email"
                    className="text-xs font-semibold tracking-wider text-muted-foreground uppercase"
                  >
                    {t.profile.newEmailLabel}
                  </label>
                  <Input
                    id="profile-new-email"
                    type="email"
                    placeholder="new@dream5.local"
                    value={newEmail}
                    onChange={(event) => {
                      setNewEmail(event.target.value);
                    }}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label
                    htmlFor="profile-email-password"
                    className="text-xs font-semibold tracking-wider text-muted-foreground uppercase"
                  >
                    {t.profile.currentPasswordForEmailLabel}
                  </label>
                  <PasswordInput
                    id="profile-email-password"
                    placeholder="••••••••"
                    value={emailChangePassword}
                    onChange={(event) => {
                      setEmailChangePassword(event.target.value);
                    }}
                    minLength={8}
                    required
                  />
                </div>
                <Button
                  type="submit"
                  variant="outline"
                  size="sm"
                  disabled={
                    requestEmailChangeMutation.isPending || !newEmail.trim() || !emailChangePassword
                  }
                >
                  {requestEmailChangeMutation.isPending
                    ? t.profile.sendingEmailCodeBtn
                    : t.profile.sendEmailCodeBtn}
                </Button>
              </form>
            </div>

            <div className="space-y-3 border-b border-border pb-4">
              <div className="flex items-center gap-2 text-xs font-semibold tracking-wider text-foreground uppercase">
                <KeyRound className="h-3.5 w-3.5 text-primary" />
                {t.profile.securityCardTitle}
              </div>
              <p className="text-xs text-muted-foreground">{t.profile.securityDesc}</p>

              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={requestPasswordResetMutation.isPending}
                onClick={() => {
                  requestPasswordResetMutation.mutate();
                }}
              >
                <KeyRound className="h-3.5 w-3.5" />
                {requestPasswordResetMutation.isPending
                  ? t.profile.sendingResetBtn
                  : t.profile.updatePasswordBtn}
              </Button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <Button
                type="button"
                variant="danger"
                size="sm"
                onClick={() => {
                  setConfirmDeleteUsername('');
                  setSuccessorSelections({});
                  setDeleteStep(1);
                }}
              >
                <UserX className="h-3.5 w-3.5" />
                {t.profile.deleteAccountBtn}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-primary" />
            {t.profile.leaguesCardTitle} ({leagues.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {leagues.length === 0 ? (
            <div className="rounded-lg border border-border bg-surface-deep/70 p-4 text-sm text-muted-foreground">
              {t.profile.noLeaguesJoined}
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {leagues.map((league) => (
                <div
                  key={league.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface-deep/75 p-3.5 text-sm"
                >
                  <div className="flex items-center gap-3">
                    <TeamLogo code={league.userTeamCode} name={league.userTeamName} size="md" />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground">{league.name}</span>
                        <Badge variant={league.userRole === 'PRESIDENT' ? 'primary' : 'outline'}>
                          {league.userRole === 'PRESIDENT' ? <Crown className="h-3 w-3" /> : null}
                          {translateLeagueRole(league.userRole, language)}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {league.userTeamName} ({league.userTeamCode}) · {t.common.roundLabel}{' '}
                        {league.currentRoundNumber}/{league.totalRounds}
                      </p>
                    </div>
                  </div>
                  <div className="text-right text-xs tabular-nums">
                    <p className="font-display text-base font-bold text-primary">
                      #{league.userRank}
                    </p>
                    <p className="text-muted-foreground">
                      {league.userTotalFp.toLocaleString(locale, {
                        minimumFractionDigits: 1,
                        maximumFractionDigits: 1,
                      })}{' '}
                      {t.common.dp}
                    </p>
                    <p className="text-muted-foreground">
                      {formatMillions(league.userBudgetMillions)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <ModalDialog
        open={deleteStep === 1}
        onClose={resetDeleteFlow}
        title={t.profile.deleteStep1Title}
        description={t.profile.deleteStep1Desc}
      >
        <div className="flex items-center justify-between gap-3 pt-2">
          <Button type="button" variant="outline" size="sm" onClick={resetDeleteFlow}>
            {t.common.cancel}
          </Button>
          <Button
            type="button"
            variant="danger"
            size="sm"
            onClick={() => {
              setDeleteStep(2);
            }}
          >
            {t.profile.deleteAcceptBtn}
          </Button>
        </div>
      </ModalDialog>

      <ModalDialog
        open={deleteStep === 2}
        onClose={resetDeleteFlow}
        title={t.profile.deleteStep2Title}
        description={t.profile.deleteStep2Desc}
      >
        <div className="flex items-center justify-between gap-3 pt-2">
          <Button
            type="button"
            variant="danger"
            size="sm"
            onClick={() => {
              setDeleteStep(3);
            }}
          >
            {t.profile.deleteAcceptBtn}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={resetDeleteFlow}>
            {t.common.cancel}
          </Button>
        </div>
      </ModalDialog>

      <ModalDialog
        open={deleteStep === 3}
        onClose={resetDeleteFlow}
        title={t.profile.deleteStep3Title}
        description={t.profile.deleteStep3Desc}
      >
        <form onSubmit={handleDeleteFinalSubmit} className="space-y-4">
          {deletionContextQuery.isLoading ? (
            <p className="text-xs text-muted-foreground">{t.common.loading}</p>
          ) : (
            presidedLeaguesForDelete.map((presided) =>
              presided.candidates.length > 0 ? (
                <div key={presided.leagueId} className="space-y-1.5">
                  <label
                    htmlFor={`successor-${presided.leagueId}`}
                    className="block text-xs font-semibold tracking-wider text-muted-foreground uppercase"
                  >
                    {f(t.profile.deleteSuccessorLabel, { leagueName: presided.leagueName })}
                  </label>
                  <select
                    id={`successor-${presided.leagueId}`}
                    value={resolvedSuccessorMap[presided.leagueId] ?? ''}
                    onChange={(event) => {
                      const nextId = event.target.value;
                      setSuccessorSelections((prev) => ({
                        ...prev,
                        [presided.leagueId]: nextId,
                      }));
                    }}
                    className="h-9 w-full min-w-0 rounded-md border border-border bg-surface-deep px-2.5 text-sm text-foreground"
                    required
                  >
                    {presided.candidates.map((candidate) => (
                      <option key={candidate.userId} value={candidate.userId}>
                        {candidate.username} ({candidate.tag}) · {candidate.teamName} (
                        {candidate.teamCode})
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <p
                  key={presided.leagueId}
                  className="rounded-md border border-border bg-surface-deep/80 px-3 py-2 text-xs text-muted-foreground"
                >
                  {f(t.profile.deleteEmptyLeagueNotice, { leagueName: presided.leagueName })}
                </p>
              ),
            )
          )}

          <div className="space-y-1.5">
            <label
              htmlFor="delete-confirm-username"
              className="block text-xs font-semibold tracking-wider text-muted-foreground uppercase"
            >
              {f(t.profile.deleteConfirmLabel, { username: user.username })}
            </label>
            <Input
              id="delete-confirm-username"
              placeholder={user.username}
              value={confirmDeleteUsername}
              onChange={(event) => {
                setConfirmDeleteUsername(event.target.value);
              }}
              autoComplete="off"
              required
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={resetDeleteFlow}>
              {t.common.cancel}
            </Button>
            <Button
              type="submit"
              variant="danger"
              size="sm"
              disabled={
                deletionContextQuery.isLoading ||
                deleteAccountMutation.isPending ||
                confirmDeleteUsername !== user.username ||
                !hasAllRequiredSuccessors
              }
            >
              {t.profile.deleteConfirmBtn}
            </Button>
          </div>
        </form>
      </ModalDialog>
    </div>
  );
}
