import { SOCKET_EVENTS } from '@dreamfive/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { io, type Socket } from 'socket.io-client';

import { getSocketConnectionConfig, getStoredAccessToken } from './api-client';

export function useLeagueRealtime(
  userId: string | null | undefined,
  leagueId: string | null | undefined,
): boolean {
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !userId || !leagueId) {
      return;
    }

    const invalidateClockQueries = () => {
      void queryClient.invalidateQueries({ queryKey: ['leagues'] });
      void queryClient.invalidateQueries({ queryKey: ['dev', 'league', leagueId] });
    };

    const invalidateLeagueQueries = () => {
      void queryClient.invalidateQueries({ queryKey: ['leagues'] });
      void queryClient.invalidateQueries({ queryKey: ['league', leagueId] });
      void queryClient.invalidateQueries({ queryKey: ['dev', 'league', leagueId] });
    };

    const socketConfig = getSocketConnectionConfig();
    const socketOptions = {
      path: socketConfig.path,
      withCredentials: true,
      transports: ['websocket', 'polling'] as ('websocket' | 'polling')[],
      auth: (cb: (data: Record<string, string>) => void) => {
        const token = getStoredAccessToken();
        cb(token ? { token } : {});
      },
    };
    const socket: Socket = socketConfig.url
      ? io(socketConfig.url, socketOptions)
      : io(socketOptions);

    socket.on('connect', () => {
      socket.emit(
        SOCKET_EVENTS.joinLeagueRoom,
        { leagueId },
        (ack?: { readonly joined?: boolean }) => {
          setConnected(ack?.joined ?? true);
          invalidateLeagueQueries();
        },
      );
    });

    socket.on('disconnect', () => {
      setConnected(false);
    });

    socket.on('connect_error', () => {
      setConnected(false);
    });

    socket.on(SOCKET_EVENTS.clockUpdated, invalidateClockQueries);
    socket.on(SOCKET_EVENTS.matchUpdated, invalidateLeagueQueries);
    socket.on(SOCKET_EVENTS.roundCompleted, invalidateLeagueQueries);
    socket.on(SOCKET_EVENTS.standingsUpdated, invalidateLeagueQueries);
    socket.on(SOCKET_EVENTS.marketUpdated, invalidateLeagueQueries);
    socket.on(SOCKET_EVENTS.transferUpdated, invalidateLeagueQueries);
    socket.on(SOCKET_EVENTS.seasonRollover, invalidateLeagueQueries);
    socket.on(SOCKET_EVENTS.mailUpdated, invalidateLeagueQueries);

    const handleVisibilityOrOnline = () => {
      if (document.visibilityState === 'visible') {
        invalidateLeagueQueries();
      }
    };
    window.addEventListener('online', invalidateLeagueQueries);
    document.addEventListener('visibilitychange', handleVisibilityOrOnline);

    return () => {
      setConnected(false);
      window.removeEventListener('online', invalidateLeagueQueries);
      document.removeEventListener('visibilitychange', handleVisibilityOrOnline);
      socket.emit(SOCKET_EVENTS.leaveLeagueRoom, { leagueId });
      socket.disconnect();
    };
  }, [userId, leagueId, queryClient]);

  return Boolean(userId && leagueId && connected);
}
