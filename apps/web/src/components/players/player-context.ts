import type {
  AvailabilityStatus as SharedAvailability,
  PlayerInstanceDto,
  PlayerRole as SharedRole,
  Position,
} from '@dreamfive/shared';
import {
  createContext,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  useContext,
} from 'react';

import type { AvailabilityStatus, Player, PlayerRole } from '@/types/fantasy';

export interface PlayerContextTarget {
  readonly id: string;
  readonly name: string;
  readonly position?: Position;
  readonly role?: SharedRole | PlayerRole;
  readonly status?: SharedAvailability | AvailabilityStatus;
  readonly teamId?: string;
  readonly teamCode?: string;
  readonly priceMillions?: number;
}

export interface PlayerContextTriggerProps {
  readonly onContextMenu: (e: ReactMouseEvent<HTMLElement>) => void;
  readonly onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void;
  readonly onPointerMove: (e: ReactPointerEvent<HTMLElement>) => void;
  readonly onPointerUp: () => void;
  readonly onPointerCancel: () => void;
  readonly onClickCapture: (e: ReactMouseEvent<HTMLElement>) => void;
}

export interface PlayerContextMenuValue {
  readonly inspectPlayer: (playerId: string) => void;
  readonly openPlayerMenu: (target: PlayerContextTarget, clientX: number, clientY: number) => void;
  readonly getTriggerProps: (target: PlayerContextTarget) => PlayerContextTriggerProps;
}

export const PlayerContextMenuContext = createContext<PlayerContextMenuValue | null>(null);

export function dtoToContextTarget(player: PlayerInstanceDto): PlayerContextTarget {
  return {
    id: player.id,
    name: player.name,
    position: player.position,
    role: player.role,
    status: player.status,
    teamId: player.currentTeamId,
    teamCode: player.teamCode,
    priceMillions: player.priceMillions,
  };
}

export function uiToContextTarget(player: Player): PlayerContextTarget {
  return {
    id: player.id,
    name: player.name,
    position: player.position,
    role: player.role,
    status: player.status,
    teamId: player.teamId,
    teamCode: player.teamAbbr,
    priceMillions: player.priceMillions,
  };
}

export function usePlayerContextMenu(): PlayerContextMenuValue {
  const ctx = useContext(PlayerContextMenuContext);
  if (!ctx) {
    throw new Error('usePlayerContextMenu debe utilizarse dentro de PlayerContextMenuProvider');
  }
  return ctx;
}
