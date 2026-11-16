import { ADMIN_SIMULATION_EMAIL, type AuthUserDto } from '@dream5/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';

import { Dream5StateContext, type Dream5StateContextValue } from '@/hooks/use-dream5-state';
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
import { authApi, invitationsApi, leaguesApi, mailApi, usersApi } from '@/services/dream5-api';
import { useLeagueRealtime } from '@/services/use-league-realtime';
import type { UserPreferences } from '@/types/fantasy';

const ACTIVE_LEAGUE_STORAGE_KEY = 'dream5_active_league_id';

const FALLBACK_PREFERENCES: UserPreferences = {
  tradeAlerts: true,
  injuryAlerts: true,
  lineupReminder: true,
  compactTables: false,
  ...DEFAULT_APPEARANCE,
};

export function Dream5StateProvider({ children }: { readonly children: ReactNode }) {
  const queryClient = useQueryClient();
  const [selectedLeagueId, setSelectedLeagueId] = useState<string | null>(null);
  const [guestAppearance, setGuestAppearance] = useState<AppearanceSettings>(() =>
    readStoredAppearance(),
  );

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

  useLeagueRealtime(user?.id, activeLeague?.id);

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

  const value = useMemo<Dream5StateContextValue>(
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
      preferences,
      appearance,
      updatePreference,
      updateAppearance,
      refreshSession,
      invalidateActiveLeague,
      logout,
    ],
  );

  return <Dream5StateContext.Provider value={value}>{children}</Dream5StateContext.Provider>;
}
