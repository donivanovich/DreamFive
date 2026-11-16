import { SOCKET_EVENTS } from '@dream5/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { io, type Socket } from 'socket.io-client';

import { getApiBaseUrl, getStoredAccessToken } from './api-client';

export function useLeagueRealtime(
  userId: string | null | undefined,
  leagueId: string | null | undefined,
): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (typeof window === 'undefined' || !userId || !leagueId) {
      return;
    }

    const token = getStoredAccessToken();
    const socket: Socket = io(getApiBaseUrl(), {
      withCredentials: true,
      transports: ['websocket', 'polling'],
      ...(token ? { auth: { token } } : {}),
    });

    const invalidateLeagueQueries = () => {
      void queryClient.invalidateQueries({ queryKey: ['leagues'] });
      void queryClient.invalidateQueries({ queryKey: ['league', leagueId] });
      void queryClient.invalidateQueries({ queryKey: ['dev', 'league', leagueId] });
    };

    socket.on('connect', () => {
      socket.emit(SOCKET_EVENTS.joinLeagueRoom, { leagueId });
    });

    socket.on(SOCKET_EVENTS.matchUpdated, invalidateLeagueQueries);
    socket.on(SOCKET_EVENTS.roundCompleted, invalidateLeagueQueries);
    socket.on(SOCKET_EVENTS.standingsUpdated, invalidateLeagueQueries);
    socket.on(SOCKET_EVENTS.marketUpdated, invalidateLeagueQueries);
    socket.on(SOCKET_EVENTS.transferUpdated, invalidateLeagueQueries);
    socket.on(SOCKET_EVENTS.seasonRollover, invalidateLeagueQueries);
    socket.on(SOCKET_EVENTS.mailUpdated, invalidateLeagueQueries);

    return () => {
      socket.emit(SOCKET_EVENTS.leaveLeagueRoom, { leagueId });
      socket.disconnect();
    };
  }, [userId, leagueId, queryClient]);
}
