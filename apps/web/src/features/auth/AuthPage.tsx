import { useNavigate } from '@tanstack/react-router';
import {
  CheckCircle2,
  KeyRound,
  MailCheck,
  Moon,
  ShieldCheck,
  Sparkles,
  Sun,
  Trophy,
} from 'lucide-react';
import { type SyntheticEvent, useState } from 'react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { useToast } from '@/components/ui/toast-context';
import { useDream5State } from '@/hooks/use-dream5-state';
import { useI18n } from '@/hooks/use-i18n';
import { cn } from '@/lib/utils';
import { ApiError } from '@/services/api-client';
import { authApi } from '@/services/dream5-api';

type AuthStep = 'login' | 'register' | 'verify';

export function AuthPage() {
  const navigate = useNavigate();
  const { refreshSession, appearance, updateAppearance } = useDream5State();
  const { t } = useI18n();
  const { showToast } = useToast();

  const [mode, setMode] = useState<AuthStep>('login');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [verificationEmail, setVerificationEmail] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [pending, setPending] = useState(false);
  const [resending, setResending] = useState(false);

  const handleSubmit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);

    try {
      if (mode === 'login') {
        await authApi.login({ email: email.trim(), password });
        await refreshSession();
        await navigate({ to: '/' });
        return;
      }

      if (mode === 'register') {
        const res = await authApi.register({
          email: email.trim(),
          username: username.trim(),
          password,
        });
        setVerificationEmail(res.email);
        setVerificationCode('');
        setMode('verify');
        showToast({ tone: 'info', message: t.auth.verifySentToast });
        return;
      }

      await authApi.verifyEmail({
        email: verificationEmail.trim(),
        code: verificationCode.trim(),
      });
      await refreshSession();
      showToast({ tone: 'success', message: t.auth.verifySuccessToast });
      await navigate({ to: '/' });
    } catch (error) {
      if (
        mode === 'login' &&
        error instanceof ApiError &&
        error.statusCode === 403 &&
        error.message.includes('EMAIL_NOT_VERIFIED')
      ) {
        setVerificationEmail(email.trim().toLowerCase());
        setVerificationCode('');
        setMode('verify');
        showToast({ tone: 'warning', message: t.auth.unverifiedPrompt });
        return;
      }

      showToast({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Unable to complete authentication.',
      });
    } finally {
      setPending(false);
    }
  };

  const handleResendCode = async () => {
    if (!verificationEmail.trim()) {
      return;
    }
    setResending(true);
    try {
      await authApi.resendVerification({ email: verificationEmail.trim() });
      showToast({ tone: 'success', message: t.auth.resendSuccessToast });
    } catch (error) {
      showToast({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Could not resend code.',
      });
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="mx-auto grid max-w-5xl items-center gap-5 lg:grid-cols-[1.15fr_1fr] lg:gap-8">
      <div className="min-w-0 space-y-3.5 sm:space-y-6">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/35 bg-primary/10 px-3 py-1 text-xs font-semibold tracking-wider text-primary uppercase">
          <Sparkles className="h-3.5 w-3.5" />
          DREAM5 · Basket Management Simulator
        </div>

        <h1 className="font-display text-2xl font-bold tracking-wide text-foreground uppercase sm:text-4xl md:text-5xl">
          {t.auth.heroHeadline}
        </h1>

        <p className="text-xs leading-relaxed text-muted-foreground sm:text-sm md:text-base">
          {t.auth.heroDesc}
        </p>

        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          {[
            { icon: Trophy, title: t.auth.feature1Title, desc: t.auth.feature1Desc },
            { icon: ShieldCheck, title: t.auth.feature2Title, desc: t.auth.feature2Desc },
            { icon: KeyRound, title: t.auth.feature3Title, desc: t.auth.feature3Desc },
            { icon: CheckCircle2, title: t.auth.feature4Title, desc: t.auth.feature4Desc },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <Card key={item.title} className="bg-card/75">
                <CardContent className="space-y-1 pt-3 sm:space-y-1.5 sm:pt-4">
                  <div className="flex items-center gap-1.5 text-primary sm:gap-2">
                    <Icon className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
                    <p className="font-display text-xs font-bold tracking-wider uppercase sm:text-sm">
                      {item.title}
                    </p>
                  </div>
                  <p className="text-[11px] leading-snug text-muted-foreground sm:text-xs">
                    {item.desc}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      <Card className="border-primary/35">
        <CardHeader className="flex-col items-stretch gap-3 pb-4">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-xl">
              {mode === 'verify' ? t.auth.verifyTitle : 'DREAM5'}
            </CardTitle>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  void updateAppearance({
                    themeMode: appearance.themeMode === 'dark' ? 'light' : 'dark',
                  });
                }}
                aria-label={t.appearance.themeModeLabel}
                title={
                  appearance.themeMode === 'dark' ? t.appearance.lightMode : t.appearance.darkMode
                }
                className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded border border-border bg-surface-deep text-muted-foreground transition-colors hover:text-foreground"
              >
                {appearance.themeMode === 'dark' ? (
                  <Sun className="h-3.5 w-3.5" />
                ) : (
                  <Moon className="h-3.5 w-3.5" />
                )}
              </button>

              <div className="inline-flex rounded border border-border bg-surface-deep p-0.5 text-[11px] font-semibold">
                {(['en', 'es'] as const).map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => {
                      void updateAppearance({ language: lang });
                    }}
                    className={cn(
                      'cursor-pointer rounded px-1.5 py-0.5 uppercase transition-colors',
                      appearance.language === lang
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {lang}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {mode !== 'verify' ? (
            <div className="grid grid-cols-2 gap-2 rounded-md border border-border bg-surface-deep p-1">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                }}
                className={`cursor-pointer rounded px-3 py-1.5 text-xs font-semibold uppercase transition-colors ${
                  mode === 'login'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t.auth.signInTab}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                }}
                className={`cursor-pointer rounded px-3 py-1.5 text-xs font-semibold uppercase transition-colors ${
                  mode === 'register'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t.auth.registerTab}
              </button>
            </div>
          ) : null}
        </CardHeader>

        <CardContent className="space-y-4">
          <form
            onSubmit={(event) => {
              void handleSubmit(event);
            }}
            className="space-y-3.5"
          >
            {mode === 'verify' ? (
              <>
                <div className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2.5 text-xs text-foreground">
                  <div className="flex items-center gap-2 font-semibold text-primary">
                    <MailCheck className="h-4 w-4 shrink-0" />
                    <span>{t.auth.verifyTitle}</span>
                  </div>
                  <p className="mt-1 text-muted-foreground">
                    {t.auth.verifyDescPrefix}{' '}
                    <span className="font-semibold text-foreground">{verificationEmail}</span>
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="verify-code"
                    className="text-xs font-semibold tracking-wider text-muted-foreground uppercase"
                  >
                    {t.auth.verifyCodeLabel}
                  </label>
                  <Input
                    id="verify-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder="123456"
                    value={verificationCode}
                    onChange={(event) => {
                      setVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 6));
                    }}
                    className="text-center font-display text-xl font-bold tracking-[0.35em]"
                    required
                  />
                </div>
              </>
            ) : (
              <>
                {mode === 'register' ? (
                  <div className="space-y-1.5">
                    <label
                      htmlFor="auth-username"
                      className="text-xs font-semibold tracking-wider text-muted-foreground uppercase"
                    >
                      {t.auth.usernameLabel}
                    </label>
                    <Input
                      id="auth-username"
                      autoComplete="username"
                      placeholder="AlexCoach"
                      value={username}
                      onChange={(event) => {
                        setUsername(event.target.value);
                      }}
                      minLength={3}
                      maxLength={32}
                      required
                    />
                  </div>
                ) : null}

                <div className="space-y-1.5">
                  <label
                    htmlFor="auth-email"
                    className="text-xs font-semibold tracking-wider text-muted-foreground uppercase"
                  >
                    {t.auth.emailLabel}
                  </label>
                  <Input
                    id="auth-email"
                    type="email"
                    autoComplete="email"
                    placeholder="ivan.k@dream5.local"
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value);
                    }}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="auth-password"
                    className="text-xs font-semibold tracking-wider text-muted-foreground uppercase"
                  >
                    {t.auth.passwordLabel}
                  </label>
                  <PasswordInput
                    id="auth-password"
                    autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value);
                    }}
                    minLength={8}
                    required
                  />
                </div>
              </>
            )}

            <Button type="submit" variant="primary" className="w-full" disabled={pending}>
              {pending
                ? mode === 'login'
                  ? t.auth.signingInBtn
                  : mode === 'register'
                    ? t.auth.registeringBtn
                    : t.auth.verifyingBtn
                : mode === 'login'
                  ? t.auth.signInBtn
                  : mode === 'register'
                    ? t.auth.registerBtn
                    : t.auth.verifyBtn}
            </Button>

            {mode === 'verify' ? (
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={resending}
                  onClick={() => {
                    void handleResendCode();
                  }}
                >
                  {resending ? t.auth.resendingBtn : t.auth.resendBtn}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setMode('login');
                  }}
                >
                  {t.auth.backToAuthBtn}
                </Button>
              </div>
            ) : null}
          </form>

          {mode !== 'verify' ? (
            <div className="border-t border-border pt-3">
              <p className="mb-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                {t.auth.demoTitle}
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setEmail('ivan.k@dream5.local');
                    setPassword('Dream5Demo!2026');
                  }}
                  className="flex cursor-pointer items-center justify-between rounded-md border border-border bg-surface-deep px-2.5 py-2 text-left text-xs transition-colors hover:border-primary/45"
                >
                  <div>
                    <p className="font-semibold text-foreground">Iván K.</p>
                    <p className="text-[10px] text-muted-foreground">{t.auth.adminRoleNote}</p>
                  </div>
                  <Badge variant="primary">#D5-1001</Badge>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setEmail('maria.s@dream5.local');
                    setPassword('Dream5Demo!2026');
                  }}
                  className="flex cursor-pointer items-center justify-between rounded-md border border-border bg-surface-deep px-2.5 py-2 text-left text-xs transition-colors hover:border-primary/45"
                >
                  <div>
                    <p className="font-semibold text-foreground">María S.</p>
                    <p className="text-[10px] text-muted-foreground">{t.auth.userRoleNote}</p>
                  </div>
                  <Badge variant="outline">#D5-1002</Badge>
                </button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
