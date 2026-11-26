import type { Position } from '@dreamfive/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import {
  ArrowLeftRight,
  BarChart3,
  Building2,
  ClipboardCheck,
  Search,
  Star,
  TrendingUp,
} from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { AvailabilityBadge, PositionBadge, RoleBadge } from '@/components/players/PlayerBadges';
import {
  PlayerContextMenuContext,
  type PlayerContextMenuValue,
  type PlayerContextTarget,
  type PlayerContextTriggerProps,
} from '@/components/players/player-context';
import { PlayerDetailModal } from '@/components/players/PlayerDetailModal';
import { useToast } from '@/components/ui/toast-context';
import { useDreamFiveState } from '@/hooks/use-dreamfive-state';
import { useI18n } from '@/hooks/use-i18n';
import { formatMillions } from '@/lib/formatters';
import { lineupApi } from '@/services/dreamfive-api';
import { toUiAvailability, toUiRole } from '@/services/mappers';

interface PlayerContextMenuState {
  readonly target: PlayerContextTarget;
  readonly x: number;
  readonly y: number;
}

const LONG_PRESS_MS = 420;
const MOVE_CANCEL_PX = 8;

const POSITION_TO_LINEUP_KEY: Record<
  Position,
  'pgPlayerId' | 'sgPlayerId' | 'sfPlayerId' | 'pfPlayerId' | 'cPlayerId'
> = {
  PG: 'pgPlayerId',
  SG: 'sgPlayerId',
  SF: 'sfPlayerId',
  PF: 'pfPlayerId',
  C: 'cPlayerId',
};

export function PlayerContextMenuProvider({ children }: { readonly children: ReactNode }) {
  const { activeLeague, invalidateActiveLeague } = useDreamFiveState();
  const { f, t } = useI18n();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [menu, setMenu] = useState<PlayerContextMenuState | null>(null);
  const [inspectedPlayerId, setInspectedPlayerId] = useState<string | null>(null);
  const [isSettingStarter, setIsSettingStarter] = useState(false);

  const menuRef = useRef<HTMLDivElement | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const suppressNextClickRef = useRef(false);

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    pointerStartRef.current = null;
  }, []);

  const closeMenu = useCallback(() => {
    setMenu(null);
  }, []);

  const openPlayerMenu = useCallback(
    (target: PlayerContextTarget, clientX: number, clientY: number) => {
      const margin = 12;
      const estimatedWidth = 272;
      const estimatedHeight = 360;
      const maxX = Math.max(margin, window.innerWidth - estimatedWidth - margin);
      const maxY = Math.max(margin, window.innerHeight - estimatedHeight - margin);
      setMenu({
        target,
        x: Math.min(Math.max(margin, clientX), maxX),
        y: Math.min(Math.max(margin, clientY), maxY),
      });
    },
    [],
  );

  const inspectPlayer = useCallback((playerId: string) => {
    setMenu(null);
    setInspectedPlayerId(playerId);
  }, []);

  const getTriggerProps = useCallback(
    (target: PlayerContextTarget): PlayerContextTriggerProps => ({
      onContextMenu: (e) => {
        e.preventDefault();
        e.stopPropagation();
        clearLongPress();
        openPlayerMenu(target, e.clientX, e.clientY);
      },
      onPointerDown: (e) => {
        if (e.pointerType !== 'touch' && e.pointerType !== 'pen') {
          return;
        }
        clearLongPress();
        const startX = e.clientX;
        const startY = e.clientY;
        pointerStartRef.current = { x: startX, y: startY };
        longPressTimerRef.current = setTimeout(() => {
          suppressNextClickRef.current = true;
          openPlayerMenu(target, startX, startY);
          longPressTimerRef.current = null;
          pointerStartRef.current = null;
        }, LONG_PRESS_MS);
      },
      onPointerMove: (e) => {
        if (!pointerStartRef.current) {
          return;
        }
        const dx = Math.abs(e.clientX - pointerStartRef.current.x);
        const dy = Math.abs(e.clientY - pointerStartRef.current.y);
        if (dx > MOVE_CANCEL_PX || dy > MOVE_CANCEL_PX) {
          clearLongPress();
        }
      },
      onPointerUp: () => {
        clearLongPress();
      },
      onPointerCancel: () => {
        clearLongPress();
      },
      onClickCapture: (e) => {
        if (suppressNextClickRef.current) {
          suppressNextClickRef.current = false;
          e.preventDefault();
          e.stopPropagation();
        }
      },
    }),
    [clearLongPress, openPlayerMenu],
  );

  useEffect(() => {
    if (!menu) {
      return;
    }
    const handlePointerDownOutside = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenu(null);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenu(null);
      }
    };
    const handleScroll = () => {
      setMenu(null);
    };
    window.addEventListener('pointerdown', handlePointerDownOutside, true);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDownOutside, true);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [menu]);

  useEffect(() => {
    return () => {
      clearLongPress();
    };
  }, [clearLongPress]);

  const handleSetStarter = useCallback(async () => {
    const pos = menu?.target.position;
    if (!menu || !activeLeague || !pos) {
      return;
    }
    const leagueId = activeLeague.id;
    const { target } = menu;
    setIsSettingStarter(true);
    try {
      const currentLineup = await lineupApi.get(leagueId);
      if (currentLineup.isLocked) {
        showToast({
          tone: 'error',
          title: t.playerUi.ctxLineupLockedTitle,
          message: f(t.playerUi.ctxLineupLockedMsg, { round: currentLineup.roundNumber }),
        });
        setMenu(null);
        return;
      }

      const slotKey = POSITION_TO_LINEUP_KEY[pos];
      if (currentLineup[slotKey] === target.id) {
        showToast({
          tone: 'info',
          message: f(t.playerUi.ctxAlreadyStarter, { name: target.name, pos }),
        });
        setMenu(null);
        return;
      }

      const payload = {
        pgPlayerId: currentLineup.pgPlayerId ?? target.id,
        sgPlayerId: currentLineup.sgPlayerId ?? target.id,
        sfPlayerId: currentLineup.sfPlayerId ?? target.id,
        pfPlayerId: currentLineup.pfPlayerId ?? target.id,
        cPlayerId: currentLineup.cPlayerId ?? target.id,
        [slotKey]: target.id,
      };
      const saved = await lineupApi.save(leagueId, payload, currentLineup.roundNumber);
      await queryClient.invalidateQueries({ queryKey: ['league', leagueId, 'lineup'] });
      invalidateActiveLeague();
      showToast({
        tone: 'success',
        title: t.playerUi.ctxLineupUpdatedTitle,
        message: f(t.playerUi.ctxLineupUpdatedMsg, {
          name: target.name,
          pos,
          round: saved.roundNumber,
        }),
      });
      setMenu(null);
    } catch (error: unknown) {
      showToast({
        tone: 'error',
        title: t.playerUi.ctxLineupErrTitle,
        message: error instanceof Error ? error.message : t.playerUi.ctxLineupErrTitle,
      });
    } finally {
      setIsSettingStarter(false);
    }
  }, [activeLeague, f, invalidateActiveLeague, menu, queryClient, showToast, t]);

  const isOwnPlayer = Boolean(
    activeLeague && menu?.target.teamId && menu.target.teamId === activeLeague.userTeamId,
  );

  const value = useMemo<PlayerContextMenuValue>(
    () => ({ inspectPlayer, openPlayerMenu, getTriggerProps }),
    [inspectPlayer, openPlayerMenu, getTriggerProps],
  );

  return (
    <PlayerContextMenuContext.Provider value={value}>
      {children}

      {menu ? (
        <div
          ref={menuRef}
          role="menu"
          aria-label={f(t.playerUi.ctxMenuAria, { name: menu.target.name })}
          style={{ left: `${String(menu.x)}px`, top: `${String(menu.y)}px` }}
          className="fixed z-[80] w-68 rounded-xl border border-primary/35 bg-card/95 p-2 shadow-2xl backdrop-blur-md"
        >
          <div className="border-b border-border/80 px-2.5 pt-1.5 pb-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-display text-base font-bold tracking-wide text-foreground">
                  {menu.target.name}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {menu.target.teamCode ?? ''}
                  {isOwnPlayer ? ` · ${t.common.youTeam}` : ''}
                  {typeof menu.target.priceMillions === 'number'
                    ? ` · ${formatMillions(menu.target.priceMillions)}`
                    : ''}
                </p>
              </div>
              {menu.target.position ? <PositionBadge position={menu.target.position} /> : null}
            </div>

            {menu.target.role || menu.target.status ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {menu.target.role ? <RoleBadge role={toUiRole(menu.target.role)} /> : null}
                {menu.target.status ? (
                  <AvailabilityBadge status={toUiAvailability(menu.target.status)} />
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="mt-1.5 flex flex-col gap-0.5 text-xs">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                inspectPlayer(menu.target.id);
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left font-medium text-foreground transition-colors hover:bg-secondary"
            >
              <BarChart3 className="h-4 w-4 shrink-0 text-cyan" />
              {t.playerUi.ctxViewStats}
            </button>

            <button
              type="button"
              role="menuitem"
              onClick={() => {
                const target = menu.target;
                closeMenu();
                if (isOwnPlayer) {
                  void navigate({
                    to: '/transfers',
                    search: { offerPlayerId: target.id } as never,
                  });
                } else {
                  void navigate({
                    to: '/transfers',
                    search: {
                      requestPlayerId: target.id,
                      ...(target.teamId ? { targetTeamId: target.teamId } : {}),
                    } as never,
                  });
                }
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left font-medium text-foreground transition-colors hover:bg-secondary"
            >
              <ArrowLeftRight className="h-4 w-4 shrink-0 text-primary" />
              {isOwnPlayer ? t.playerUi.ctxOfferTrade : t.playerUi.ctxRequestTrade}
            </button>

            {isOwnPlayer && menu.target.position ? (
              <button
                type="button"
                role="menuitem"
                disabled={isSettingStarter}
                onClick={() => {
                  void handleSetStarter();
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-50"
              >
                <Star className="h-4 w-4 shrink-0 text-[var(--tone-success)]" />
                {isSettingStarter
                  ? t.playerUi.ctxAssigning
                  : f(t.playerUi.ctxSetStarter, { pos: menu.target.position })}
              </button>
            ) : null}

            {isOwnPlayer ? (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  closeMenu();
                  void navigate({ to: '/lineup' });
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left font-medium text-foreground transition-colors hover:bg-secondary"
              >
                <ClipboardCheck className="h-4 w-4 shrink-0 text-[var(--tone-success)]" />
                {t.playerUi.ctxOpenLineup}
              </button>
            ) : null}

            {menu.target.teamId ? (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  const teamId = menu.target.teamId;
                  closeMenu();
                  if (teamId) {
                    void navigate({
                      to: '/teams',
                      search: { teamId } as never,
                    });
                  }
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left font-medium text-foreground transition-colors hover:bg-secondary"
              >
                <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                {t.playerUi.ctxViewTeam}
              </button>
            ) : null}

            <button
              type="button"
              role="menuitem"
              onClick={() => {
                const search = menu.target.name;
                closeMenu();
                void navigate({
                  to: '/players',
                  search: { search } as never,
                });
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left font-medium text-foreground transition-colors hover:bg-secondary"
            >
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              {t.playerUi.ctxSearchPlayers}
            </button>

            <button
              type="button"
              role="menuitem"
              onClick={() => {
                closeMenu();
                void navigate({ to: '/market' });
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left font-medium text-foreground transition-colors hover:bg-secondary"
            >
              <TrendingUp className="h-4 w-4 shrink-0 text-muted-foreground" />
              {t.playerUi.ctxViewMarket}
            </button>
          </div>
        </div>
      ) : null}

      <PlayerDetailModal
        leagueId={activeLeague?.id ?? null}
        playerId={inspectedPlayerId}
        onClose={() => {
          setInspectedPlayerId(null);
        }}
      />
    </PlayerContextMenuContext.Provider>
  );
}
