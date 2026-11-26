import type { AuthUserDto, LeagueSummaryDto } from '@dreamfive/shared';
import { createContext, useContext } from 'react';

import type { AppearanceSettings } from '@/lib/appearance';
import type { UserPreferences } from '@/types/fantasy';

export interface DreamFiveStateContextValue {
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

export const DreamFiveStateContext = createContext<DreamFiveStateContextValue | null>(null);

export function useDreamFiveState(): DreamFiveStateContextValue {
  const ctx = useContext(DreamFiveStateContext);
  if (!ctx) {
    throw new Error('useDreamFiveState debe utilizarse dentro de DreamFiveStateProvider');
  }
  return ctx;
}
