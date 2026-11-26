import { Link, useRouterState } from '@tanstack/react-router';
import {
  Activity,
  ArrowLeftRight,
  ChevronDown,
  FlaskConical,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  Settings,
  Shield,
  TrendingUp,
  Trophy,
  User,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { type ComponentType, type ReactNode, useEffect, useRef, useState } from 'react';

import { AppearanceContextMenu } from '@/components/layout/AppearanceContextMenu';
import { TeamLogo, UserAvatar } from '@/components/players/PlayerBadges';
import { LoadingSkeletonCard } from '@/components/shared/LoadingErrorStates';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { AuthPage } from '@/features/auth/AuthPage';
import { useAppearanceBackgroundHandlers } from '@/hooks/use-appearance-background';
import { useDreamFiveState } from '@/hooks/use-dreamfive-state';
import { useI18n } from '@/hooks/use-i18n';
import { translateLeagueRole, translateLeagueStatus } from '@/lib/i18n';
import { cn } from '@/lib/utils';

type NavLabelKey =
  | 'dashboard'
  | 'leagues'
  | 'teams'
  | 'lineup'
  | 'players'
  | 'market'
  | 'transfers'
  | 'rankings'
  | 'matches'
  | 'mail'
  | 'profile'
  | 'settings';

interface NavItem {
  readonly to: string;
  readonly labelKey: NavLabelKey;
  readonly icon: ComponentType<{ readonly className?: string }>;
  readonly matchPaths?: readonly string[];
}

const PRIMARY_NAV: readonly NavItem[] = [
  { to: '/', labelKey: 'dashboard', icon: LayoutDashboard, matchPaths: ['/', '/dashboard'] },
  { to: '/leagues', labelKey: 'leagues', icon: Trophy },
  { to: '/teams', labelKey: 'teams', icon: Shield },
  { to: '/lineup', labelKey: 'lineup', icon: UserCheck },
  { to: '/players', labelKey: 'players', icon: Users },
  { to: '/market', labelKey: 'market', icon: TrendingUp },
  { to: '/transfers', labelKey: 'transfers', icon: ArrowLeftRight },
  { to: '/rankings', labelKey: 'rankings', icon: Trophy },
  { to: '/matches', labelKey: 'matches', icon: Activity },
  { to: '/mail', labelKey: 'mail', icon: Mail },
];

const ACCOUNT_NAV: readonly NavItem[] = [
  { to: '/profile', labelKey: 'profile', icon: User },
  { to: '/settings', labelKey: 'settings', icon: Settings },
];

function isNavItemActive(pathname: string, item: NavItem): boolean {
  if (item.matchPaths) {
    return item.matchPaths.includes(pathname);
  }
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

function SidebarContent({
  pathname,
  pendingInvitationsCount,
  onNavigate,
}: {
  readonly pathname: string;
  readonly pendingInvitationsCount: number;
  readonly onNavigate?: () => void;
}) {
  const { isSimulationAdmin, unreadMailCount } = useDreamFiveState();
  const { language, t } = useI18n();

  return (
    <div className="text-sidebar-foreground flex h-full flex-col bg-sidebar">
      <div className="flex h-16 items-center justify-between border-b border-border px-4">
        <Link to="/" onClick={onNavigate} className="flex items-center gap-3 focus:outline-none">
          <img
            src="/dreamfive-logo.png"
            alt="DreamFive"
            className="h-9 w-9 shrink-0 object-contain drop-shadow-[0_2px_10px_color-mix(in_srgb,var(--primary)_22%,transparent)]"
          />
          <span className="flex flex-col leading-none">
            <span className="font-display text-xl font-bold tracking-wider text-foreground">
              DreamFive
            </span>
            <span className="mt-0.5 text-[10px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
              BASKET MANAGER
            </span>
          </span>
        </Link>
        {onNavigate ? (
          <button
            type="button"
            onClick={onNavigate}
            aria-label={t.nav.closeMenu}
            className="cursor-pointer rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        ) : null}
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4" aria-label="Primary navigation">
        <div>
          <p className="px-3 pb-2 text-[10px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
            {language === 'es' ? 'Principal' : 'Main'}
          </p>
          <ul className="space-y-1">
            {PRIMARY_NAV.map((item) => {
              const Icon = item.icon;
              const active = isNavItemActive(pathname, item);
              const badgeCount =
                item.to === '/leagues'
                  ? pendingInvitationsCount
                  : item.to === '/mail'
                    ? unreadMailCount
                    : 0;
              return (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    onClick={onNavigate}
                    className={cn(
                      'flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors',
                      active
                        ? 'border border-primary/25 bg-primary/15 text-primary'
                        : 'border border-transparent text-muted-foreground hover:bg-secondary/70 hover:text-foreground',
                    )}
                  >
                    <span className="flex items-center gap-3">
                      <Icon
                        className={cn(
                          'h-4 w-4 shrink-0',
                          active ? 'text-primary' : 'text-muted-foreground',
                        )}
                      />
                      <span>{t.nav[item.labelKey]}</span>
                    </span>
                    {badgeCount > 0 ? (
                      <Badge variant="primary" className="px-1.5 py-0 text-[10px]">
                        {badgeCount}
                      </Badge>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>

        {isSimulationAdmin ? (
          <div>
            <p className="px-3 pb-2 text-[10px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
              {language === 'es' ? 'Motor y Control' : 'Engine & Control'}
            </p>
            <ul className="space-y-1">
              <li>
                <Link
                  to="/simulation"
                  onClick={onNavigate}
                  className={cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    pathname === '/simulation'
                      ? 'border border-primary/25 bg-primary/15 text-primary'
                      : 'border border-transparent text-muted-foreground hover:bg-secondary/70 hover:text-foreground',
                  )}
                >
                  <FlaskConical
                    className={cn(
                      'h-4 w-4 shrink-0',
                      pathname === '/simulation' ? 'text-primary' : 'text-muted-foreground',
                    )}
                  />
                  <span>{t.nav.simulation}</span>
                </Link>
              </li>
            </ul>
          </div>
        ) : null}

        <div>
          <p className="px-3 pb-2 text-[10px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
            {language === 'es' ? 'Cuenta' : 'Account'}
          </p>
          <ul className="space-y-1">
            {ACCOUNT_NAV.map((item) => {
              const Icon = item.icon;
              const active = isNavItemActive(pathname, item);
              return (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    onClick={onNavigate}
                    className={cn(
                      'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                      active
                        ? 'border border-primary/25 bg-primary/15 text-primary'
                        : 'border border-transparent text-muted-foreground hover:bg-secondary/70 hover:text-foreground',
                    )}
                  >
                    <Icon
                      className={cn(
                        'h-4 w-4 shrink-0',
                        active ? 'text-primary' : 'text-muted-foreground',
                      )}
                    />
                    <span>{t.nav[item.labelKey]}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </nav>

      <div className="border-t border-border px-4 py-3 text-[11px] text-muted-foreground">
        <p className="font-semibold tracking-wider text-foreground/80 uppercase">
          DreamFive · League Desk
        </p>
        <p className="mt-0.5 text-[10px] text-muted-foreground">
          {language === 'es'
            ? 'Universo activo 24/7 · Tiempo real'
            : '24/7 Live Universe · Real-time'}
        </p>
      </div>
    </div>
  );
}

export function AppShell({ children }: { readonly children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const {
    user,
    isAuthLoading,
    leagues,
    activeLeague,
    setActiveLeagueId,
    pendingInvitationsCount,
    logout,
  } = useDreamFiveState();
  const { language, t } = useI18n();
  const { menuPos, closeMenu, backgroundHandlers } = useAppearanceBackgroundHandlers();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [leagueMenuOpen, setLeagueMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!leagueMenuOpen) {
      return;
    }
    const handleOutsideClick = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setLeagueMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', handleOutsideClick);
    return () => {
      window.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [leagueMenuOpen]);

  const isChangePasswordRoute = pathname.startsWith('/change-password');

  if (isAuthLoading) {
    return (
      <div
        {...backgroundHandlers}
        className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground"
      >
        <div className="w-full max-w-md">
          <LoadingSkeletonCard rows={3} />
        </div>
        <AppearanceContextMenu position={menuPos} onClose={closeMenu} />
      </div>
    );
  }

  if (isChangePasswordRoute) {
    return (
      <div
        {...backgroundHandlers}
        className="min-h-screen overflow-x-clip bg-background px-4 py-10 text-foreground"
      >
        <div className="mx-auto mb-8 flex max-w-lg items-center gap-3">
          <Link to="/" className="flex items-center gap-3 focus:outline-none">
            <img
              src="/dreamfive-logo.png"
              alt="DreamFive"
              className="h-10 w-10 shrink-0 object-contain drop-shadow-[0_2px_10px_color-mix(in_srgb,var(--primary)_22%,transparent)]"
            />
            <div>
              <p className="font-display text-2xl font-bold tracking-wider uppercase">DreamFive</p>
              <p className="text-xs text-muted-foreground">{t.common.appSubtitle}</p>
            </div>
          </Link>
        </div>
        {children}
        <AppearanceContextMenu position={menuPos} onClose={closeMenu} />
      </div>
    );
  }

  if (!user) {
    return (
      <div
        {...backgroundHandlers}
        className="min-h-screen overflow-x-clip bg-background px-4 py-10 text-foreground"
      >
        <div className="mx-auto mb-8 flex max-w-5xl items-center gap-3">
          <img
            src="/dreamfive-logo.png"
            alt="DreamFive"
            className="h-10 w-10 shrink-0 object-contain drop-shadow-[0_2px_10px_color-mix(in_srgb,var(--primary)_22%,transparent)]"
          />
          <div>
            <p className="font-display text-2xl font-bold tracking-wider uppercase">DreamFive</p>
            <p className="text-xs text-muted-foreground">{t.common.appSubtitle}</p>
          </div>
        </div>
        <AuthPage />
        <AppearanceContextMenu position={menuPos} onClose={closeMenu} />
      </div>
    );
  }

  return (
    <div
      {...backgroundHandlers}
      className="flex min-h-screen overflow-x-clip bg-background text-foreground"
    >
      <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:block lg:w-60 lg:border-r lg:border-border">
        <SidebarContent pathname={pathname} pendingInvitationsCount={pendingInvitationsCount} />
      </aside>

      {mobileMenuOpen ? (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <button
            type="button"
            aria-label={t.nav.closeMenu}
            onClick={() => {
              setMobileMenuOpen(false);
            }}
            className="fixed inset-0 bg-black/70"
          />
          <div className="relative z-10 w-64 max-w-[85vw] border-r border-border bg-sidebar shadow-2xl">
            <SidebarContent
              pathname={pathname}
              pendingInvitationsCount={pendingInvitationsCount}
              onNavigate={() => {
                setMobileMenuOpen(false);
              }}
            />
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col lg:pl-60">
        <header className="sticky top-0 z-30 flex h-16 min-w-0 items-center justify-between gap-2 border-b border-border bg-sidebar/95 px-3 backdrop-blur sm:gap-3 sm:px-4 md:px-6">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(true);
              }}
              aria-label={t.nav.openMenu}
              className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-md border border-border bg-secondary/50 text-foreground hover:bg-secondary lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>

            {activeLeague ? (
              <div className="relative min-w-0" ref={dropdownRef}>
                <button
                  type="button"
                  onClick={() => {
                    setLeagueMenuOpen((open) => !open);
                  }}
                  aria-expanded={leagueMenuOpen}
                  aria-label={t.common.activeLeague}
                  className="flex max-w-full min-w-0 cursor-pointer items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 text-left text-sm transition-colors hover:border-primary/45 sm:px-3"
                >
                  <TeamLogo
                    code={activeLeague.userTeamCode}
                    name={activeLeague.userTeamName}
                    size="sm"
                  />
                  <span className="hidden text-[11px] font-semibold tracking-wider text-muted-foreground uppercase sm:inline">
                    {language === 'es' ? 'Liga:' : 'League:'}
                  </span>
                  <span className="max-w-[125px] truncate font-medium text-foreground sm:max-w-[200px]">
                    {activeLeague.name}
                  </span>
                  <Badge
                    variant={activeLeague.userRole === 'PRESIDENT' ? 'primary' : 'outline'}
                    className="hidden sm:inline-flex"
                  >
                    {translateLeagueRole(activeLeague.userRole, language)}
                  </Badge>
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>

                {leagueMenuOpen ? (
                  <div className="absolute left-0 z-40 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-card p-1.5 shadow-2xl">
                    <div className="px-2.5 py-1.5 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                      {language === 'es'
                        ? `Ligas independientes (${String(leagues.length)})`
                        : `Independent leagues (${String(leagues.length)})`}
                    </div>
                    <div className="space-y-1">
                      {leagues.map((league) => {
                        const selected = league.id === activeLeague.id;
                        return (
                          <button
                            key={league.id}
                            type="button"
                            onClick={() => {
                              setActiveLeagueId(league.id);
                              setLeagueMenuOpen(false);
                            }}
                            className={cn(
                              'flex w-full cursor-pointer items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-xs transition-colors',
                              selected
                                ? 'border border-primary/30 bg-primary/15 text-foreground'
                                : 'border border-transparent text-muted-foreground hover:bg-secondary/70 hover:text-foreground',
                            )}
                          >
                            <div className="flex min-w-0 items-center gap-2 pr-1">
                              <TeamLogo
                                code={league.userTeamCode}
                                name={league.userTeamName}
                                size="sm"
                              />
                              <div className="min-w-0">
                                <p className="truncate font-semibold text-foreground">
                                  {league.name}
                                </p>
                                <p className="mt-0.5 text-[11px] text-muted-foreground">
                                  {league.userTeamName} ·{' '}
                                  {translateLeagueStatus(league.status, language)}
                                </p>
                              </div>
                            </div>
                            <Badge
                              variant={league.userRole === 'PRESIDENT' ? 'primary' : 'outline'}
                            >
                              {translateLeagueRole(league.userRole, language)}
                            </Badge>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <Link to="/leagues" className="text-xs font-semibold text-primary hover:underline">
                {language === 'es'
                  ? 'Sin liga activa — Crea o únete a una liga'
                  : 'No active league — Create or join a league'}
              </Link>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2.5">
            {activeLeague ? (
              <Badge variant="outline" className="hidden text-[10px] md:inline-flex">
                {t.common.roundShort}
                {activeLeague.currentRoundNumber}/{activeLeague.totalRounds}
              </Badge>
            ) : null}
            <Link
              to="/profile"
              className="flex items-center gap-2.5 rounded-md border border-transparent px-2 py-1 transition-colors hover:border-border hover:bg-secondary/50"
            >
              <div className="hidden text-right sm:block">
                <p className="text-xs leading-tight font-semibold text-foreground">
                  {user.username}
                </p>
                <p className="text-[11px] leading-tight text-muted-foreground tabular-nums">
                  {user.tag}
                </p>
              </div>
              <UserAvatar
                initials={user.initials}
                username={user.username}
                avatarUrl={user.avatarUrl}
                size="sm"
              />
            </Link>
            <Button
              variant="outline"
              size="sm"
              aria-label={t.nav.signOut}
              onClick={() => {
                void logout();
              }}
              title={t.nav.signOut}
            >
              <LogOut className="h-3.5 w-3.5" />
            </Button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1440px] min-w-0 flex-1 overflow-x-clip px-3 py-4 sm:px-4 sm:py-5 md:px-6 md:py-6">
          {children}
        </main>
      </div>

      <AppearanceContextMenu position={menuPos} onClose={closeMenu} />
    </div>
  );
}
