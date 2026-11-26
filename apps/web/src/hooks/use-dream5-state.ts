import type { AuthUserDto, LeagueSummaryDto } from '@dream5/shared';
import { createContext, useContext } from 'react';

import type { AppearanceSettings } from '@/lib/appearance';
import type { UserPreferences } from '@/types/fantasy';

export interface Dream5StateContextValue {
  readonly user: AuthUserDto | null;
  readonly isAuthLoading: boolean;
  readonly isSimulationAdmin: boolean;
  readonly leagues: readonly LeagueSummaryDto[];
  readonly isLeaguesLoading: boolean;
  readonly activeLeague: LeagueSummaryDto | null;
  readonly setActiveLeagueId: (leagueId: string) => void;
  readonly pendingInvitationsCount: number;
  readonly unreadMailCount: number;
  readonly realtimeConnected: boolean;
  readonly preferences: UserPreferences;
  readonly appearance: AppearanceSettings;
  readonly updatePreference: <K extends keyof UserPreferences>(
    key: K,
    value: UserPreferences[K],
  ) => Promise<void>;
  readonly updateAppearance: (partial: Partial<AppearanceSettings>) => Promise<void>;
  readonly refreshSession: () => Promise<void>;
  readonly invalidateActiveLeague: () => void;
  readonly logout: () => Promise<void>;
}

export const Dream5StateContext = createContext<Dream5StateContextValue | null>(null);

export function useDream5State(): Dream5StateContextValue {
  const ctx = useContext(Dream5StateContext);
  if (!ctx) {
    throw new Error('useDream5State debe utilizarse dentro de Dream5StateProvider');
  }
  return ctx;
}
