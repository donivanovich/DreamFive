import { ADMIN_SIMULATION_EMAIL, type AuthUserDto } from '@dreamfive/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useToast } from '@/components/ui/toast-context';
import {
  DreamFiveStateContext,
  type DreamFiveStateContextValue,
} from '@/hooks/use-dreamfive-state';
import {
  type AppearanceSettings,
  applyAppearanceToDocument,
  DEFAULT_APPEARANCE,
  normalizeAccentColor,
  normalizeLanguage,
  normalizeThemeMode,
  readStoredAppearance,
  writeStoredAppearance,
} from '@/lib/appearance';
import { authApi, invitationsApi, leaguesApi, mailApi, usersApi } from '@/services/dreamfive-api';
import { useLeagueRealtime } from '@/services/use-league-realtime';
import type { UserPreferences } from '@/types/fantasy';

const ACTIVE_LEAGUE_STORAGE_KEY = 'dreamfive_active_league_id';

const FALLBACK_PREFERENCES: UserPreferences = {
  tradeAlerts: true,
  injuryAlerts: true,
  lineupReminder: true,
  compactTables: false,
  ...DEFAULT_APPEARANCE,
};

export function DreamFiveStateProvider({ children }: { readonly children: ReactNode }) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [selectedLeagueId, setSelectedLeagueId] = useState<string | null>(null);
  const [guestAppearance, setGuestAppearance] = useState<AppearanceSettings>(() =>
    readStoredAppearance(),
  );
  const syncingLeagueIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) {
        return;
      }
      try {
        const saved = window.localStorage.getItem(ACTIVE_LEAGUE_STORAGE_KEY);
        if (saved) {
          setSelectedLeagueId(saved);
        }
      } catch {
        // Ignorado si localStorage no está disponible
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const authQuery = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => authApi.me(),
    staleTime: 60_000,
    retry: false,
  });

  const user = authQuery.data ?? null;

  const leaguesQuery = useQuery({
    queryKey: ['leagues'],
    queryFn: () => leaguesApi.list(),
    enabled: user !== null,
    staleTime: 15_000,
    refetchInterval: (query) =>
      (query.state.data ?? []).some((league) => league.catchUpProgress?.inProgress) ? 2_000 : false,
  });

  const pendingInvitationsQuery = useQuery({
    queryKey: ['invitations', 'pending'],
    queryFn: () => invitationsApi.listPending(),
    enabled: user !== null,
    staleTime: 15_000,
  });

  const leagues = useMemo(() => leaguesQuery.data ?? [], [leaguesQuery.data]);

  const activeLeague = useMemo(() => {
    if (leagues.length === 0) {
      return null;
    }
    if (selectedLeagueId) {
      const match = leagues.find((l) => l.id === selectedLeagueId);
      if (match) {
        return match;
      }
    }
    return leagues[0] ?? null;
  }, [leagues, selectedLeagueId]);

  const mailBadgeQuery = useQuery({
    queryKey: ['league', activeLeague?.id, 'mail', 'summary'],
    queryFn: () => mailApi.list(activeLeague?.id ?? ''),
    enabled: user !== null && activeLeague !== null,
    staleTime: 15_000,
  });

  const setActiveLeagueId = useCallback((leagueId: string) => {
    setSelectedLeagueId(leagueId);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(ACTIVE_LEAGUE_STORAGE_KEY, leagueId);
      } catch {
        // Ignorado
      }
    }
  }, []);

  const realtimeConnected = useLeagueRealtime(user?.id, activeLeague?.id);

  const refreshSession = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
    await queryClient.invalidateQueries({ queryKey: ['leagues'] });
    await queryClient.invalidateQueries({ queryKey: ['invitations', 'pending'] });
  }, [queryClient]);

  const invalidateActiveLeague = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['leagues'] });
    if (activeLeague) {
      void queryClient.invalidateQueries({ queryKey: ['league', activeLeague.id] });
      void queryClient.invalidateQueries({ queryKey: ['dev', 'league', activeLeague.id] });
    }
  }, [queryClient, activeLeague]);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      setSelectedLeagueId(null);
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.removeItem(ACTIVE_LEAGUE_STORAGE_KEY);
        } catch {
          // Ignorado si localStorage no está disponible
        }
      }
      queryClient.setQueryData(['auth', 'me'], null);
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== 'auth' });
      await queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
    }
  }, [queryClient]);

  const updatePreference = useCallback(
    async <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => {
      const updatedUser = await usersApi.updatePreferences({ [key]: value });
      queryClient.setQueryData(['auth', 'me'], updatedUser);
    },
    [queryClient],
  );

  const appearance = useMemo<AppearanceSettings>(() => {
    if (user) {
      return {
        themeMode: normalizeThemeMode(user.preferences.themeMode),
        accentColor: normalizeAccentColor(user.preferences.accentColor),
        language: normalizeLanguage(user.preferences.language),
      };
    }
    return guestAppearance;
  }, [user, guestAppearance]);

  useEffect(() => {
    applyAppearanceToDocument(appearance);
    writeStoredAppearance(appearance);
  }, [appearance]);

  useEffect(() => {
    const prevSyncing = syncingLeagueIdsRef.current;
    const nextSyncing = new Set<string>();

    for (const league of leagues) {
      if (league.catchUpProgress?.inProgress) {
        nextSyncing.add(league.id);
      } else if (prevSyncing.has(league.id)) {
        void queryClient.invalidateQueries({ queryKey: ['league', league.id] });
        showToast({
          tone: 'success',
          message:
            appearance.language === 'es'
              ? `«${league.name}» ya está sincronizada al día de hoy (Jornada ${String(league.currentRoundNumber)}/${String(league.totalRounds)}).`
              : `"${league.name}" is now caught up to today (Round ${String(league.currentRoundNumber)}/${String(league.totalRounds)}).`,
        });
      }
    }

    syncingLeagueIdsRef.current = nextSyncing;
  }, [leagues, queryClient, showToast, appearance.language]);

  const updateAppearance = useCallback(
    async (partial: Partial<AppearanceSettings>) => {
      const next: AppearanceSettings = { ...appearance, ...partial };
      setGuestAppearance(next);
      applyAppearanceToDocument(next);
      writeStoredAppearance(next);

      if (user) {
        const optimisticUser: AuthUserDto = {
          ...user,
          preferences: {
            ...user.preferences,
            ...next,
          },
        };
        queryClient.setQueryData(['auth', 'me'], optimisticUser);
        try {
          const updatedUser = await usersApi.updatePreferences(partial);
          queryClient.setQueryData(['auth', 'me'], updatedUser);
        } catch (error) {
          queryClient.setQueryData(['auth', 'me'], user);
          throw error;
        }
      }
    },
    [appearance, queryClient, user],
  );

  const isSimulationAdmin = useMemo(
    () => user?.email.trim().toLowerCase() === ADMIN_SIMULATION_EMAIL,
    [user],
  );

  const preferences = useMemo(
    () => user?.preferences ?? { ...FALLBACK_PREFERENCES, ...appearance },
    [user?.preferences, appearance],
  );

  const value = useMemo<DreamFiveStateContextValue>(
    () => ({
      user,
      isAuthLoading: authQuery.isLoading,
      isSimulationAdmin,
      leagues,
      isLeaguesLoading: leaguesQuery.isLoading,
      activeLeague,
      setActiveLeagueId,
      pendingInvitationsCount: pendingInvitationsQuery.data?.length ?? 0,
      unreadMailCount: mailBadgeQuery.data?.unreadCount ?? 0,
      realtimeConnected,
      preferences,
      appearance,
      updatePreference,
      updateAppearance,
      refreshSession,
      invalidateActiveLeague,
      logout,
    }),
    [
      user,
      authQuery.isLoading,
      isSimulationAdmin,
      leagues,
      leaguesQuery.isLoading,
      activeLeague,
      setActiveLeagueId,
      pendingInvitationsQuery.data?.length,
      mailBadgeQuery.data?.unreadCount,
      realtimeConnected,
      preferences,
      appearance,
      updatePreference,
      updateAppearance,
      refreshSession,
      invalidateActiveLeague,
      logout,
    ],
  );

  return <DreamFiveStateContext.Provider value={value}>{children}</DreamFiveStateContext.Provider>;
}
