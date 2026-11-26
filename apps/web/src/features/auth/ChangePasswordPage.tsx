import { useQuery } from '@tanstack/react-query';
import { Link, useLocation } from '@tanstack/react-router';
import { CheckCircle2, KeyRound, LockKeyhole, ShieldAlert } from 'lucide-react';
import { type SyntheticEvent, useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { useToast } from '@/components/ui/toast-context';
import { useDream5State } from '@/hooks/use-dream5-state';
import { useI18n } from '@/hooks/use-i18n';
import { authApi } from '@/services/dream5-api';

export function ChangePasswordPage() {
  const location = useLocation();
  const { user } = useDream5State();
  const { showToast } = useToast();
  const { t } = useI18n();

  const token = useMemo(
    () => (new URLSearchParams(location.searchStr).get('token') ?? '').trim(),
    [location.searchStr],
  );

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const notifiedBlockedRef = useRef<string | null>(null);

  const validationQuery = useQuery({
    queryKey: ['auth', 'password-reset', 'validate', token],
    queryFn: () => authApi.validatePasswordReset(token),
    enabled: token.length > 0,
    retry: false,
    staleTime: 0,
  });

  useEffect(() => {
    if (token.length === 0) {
      if (notifiedBlockedRef.current !== 'missing') {
        notifiedBlockedRef.current = 'missing';
        showToast({
          tone: 'error',
          title: t.changePassword.blockedMissingTitle,
          message: t.changePassword.blockedMissingDesc,
        });
      }
      return;
    }
    if (!validationQuery.isLoading && (validationQuery.isError || !validationQuery.data?.valid)) {
      if (notifiedBlockedRef.current !== 'invalid') {
        notifiedBlockedRef.current = 'invalid';
        showToast({
          tone: 'error',
          title: t.changePassword.blockedInvalidTitle,
          message: t.changePassword.blockedInvalidDesc,
        });
      }
    }
  }, [
    showToast,
    t.changePassword.blockedInvalidDesc,
    t.changePassword.blockedInvalidTitle,
    t.changePassword.blockedMissingDesc,
    t.changePassword.blockedMissingTitle,
    token.length,
    validationQuery.data?.valid,
    validationQuery.isError,
    validationQuery.isLoading,
  ]);

  if (token.length === 0) {
    return (
      <div className="mx-auto max-w-lg">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-[var(--tone-danger)]" />
              {t.changePassword.blockedMissingTitle}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">{t.changePassword.blockedMissingDesc}</p>
            <div className="flex flex-wrap gap-2">
              <Link to={user ? '/profile' : '/auth'}>
                <Button variant="primary" size="sm">
                  {user ? t.changePassword.goProfile : t.changePassword.goLogin}
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (validationQuery.isLoading) {
    return (
      <div className="mx-auto max-w-lg">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" />
              {t.changePassword.validatingTitle}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{t.changePassword.validatingDesc}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (completed) {
    return (
      <div className="mx-auto max-w-lg">
        <Card className="border-emerald-500/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-[var(--tone-success)]">
              <CheckCircle2 className="h-5 w-5" />
              {t.changePassword.successTitle}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">{t.changePassword.successDesc}</p>
            <Link to={user ? '/profile' : '/auth'}>
              <Button variant="primary" size="sm">
                {user ? t.changePassword.goProfile : t.changePassword.goLogin}
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (validationQuery.isError || !validationQuery.data?.valid) {
    return (
      <div className="mx-auto max-w-lg">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LockKeyhole className="h-5 w-5 text-[var(--tone-danger)]" />
              {t.changePassword.blockedInvalidTitle}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">{t.changePassword.blockedInvalidDesc}</p>
            <Link to={user ? '/profile' : '/auth'}>
              <Button variant="primary" size="sm">
                {user ? t.changePassword.goProfile : t.changePassword.goLogin}
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleSubmit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      showToast({ tone: 'error', message: t.changePassword.mismatchError });
      return;
    }

    setSubmitting(true);
    try {
      await authApi.confirmPasswordReset({ token, newPassword });
      setCompleted(true);
      showToast({
        tone: 'success',
        title: t.changePassword.successTitle,
        message: t.changePassword.successDesc,
      });
    } catch (error) {
      showToast({
        tone: 'error',
        message: error instanceof Error ? error.message : t.changePassword.blockedInvalidTitle,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg">
      <Card className="border-primary/35">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" />
            {t.changePassword.pageTitle}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {validationQuery.data.email ? (
            <div className="rounded-md border border-border bg-surface-deep px-3 py-2 text-xs">
              <span className="text-muted-foreground">{t.changePassword.accountLabel}: </span>
              <span className="font-semibold text-foreground">{validationQuery.data.email}</span>
            </div>
          ) : null}

          <form
            onSubmit={(event) => {
              void handleSubmit(event);
            }}
            className="space-y-3.5"
          >
            <div className="space-y-1.5">
              <label
                htmlFor="reset-new-password"
                className="text-xs font-semibold tracking-wider text-muted-foreground uppercase"
              >
                {t.changePassword.newPasswordLabel}
              </label>
              <PasswordInput
                id="reset-new-password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => {
                  setNewPassword(event.target.value);
                }}
                minLength={8}
                required
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="reset-confirm-password"
                className="text-xs font-semibold tracking-wider text-muted-foreground uppercase"
              >
                {t.changePassword.confirmPasswordLabel}
              </label>
              <PasswordInput
                id="reset-confirm-password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => {
                  setConfirmPassword(event.target.value);
                }}
                minLength={8}
                required
              />
            </div>

            <Button type="submit" variant="primary" className="w-full" disabled={submitting}>
              {submitting ? t.changePassword.submittingBtn : t.changePassword.submitBtn}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
