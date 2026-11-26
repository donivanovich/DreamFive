import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarClock,
  Clock,
  FastForward,
  Play,
  Radio,
  RefreshCw,
  Server,
  ShieldAlert,
  TrendingUp,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import { NoActiveLeagueCard } from '@/components/shared/EmptyState';
import { ErrorFallbackCard, LoadingSkeletonCard } from '@/components/shared/LoadingErrorStates';
import { PageHeader } from '@/components/shared/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { useToast } from '@/components/ui/toast-context';
import { useDream5State } from '@/hooks/use-dream5-state';
import { devApi } from '@/services/dream5-api';

const ACTIVITY_LABELS: Record<string, string> = {
  'simulate-round': 'Simulación de jornada',
  'simulate-match': 'Simulación de partido',
  'reprice-league-market': 'Actualización de mercado',
  'season-rollover': 'Cambio de temporada',
  'sync-clock': 'Sincronización al reloj actual',
};

const ACTIVITY_STATUS_LABELS: Record<string, string> = {
  COMPLETED: 'Completada',
  FAILED: 'Error',
  QUEUED: 'En espera',
  RUNNING: 'En curso',
};

function formatClockParts(timestampMs: number, timeZone?: string) {
  const date = new Date(timestampMs);
  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const resolvedTz =
    timeZone && timeZone.length > 0 ? timeZone : browserTz.length > 0 ? browserTz : undefined;
  const timeText = new Intl.DateTimeFormat('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    ...(resolvedTz ? { timeZone: resolvedTz } : {}),
  }).format(date);

  const dateText = new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...(resolvedTz ? { timeZone: resolvedTz } : {}),
  }).format(date);

  const shortDateTimeText = new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    ...(resolvedTz ? { timeZone: resolvedTz } : {}),
  }).format(date);

  return { timeText, dateText, shortDateTimeText, resolvedTz: resolvedTz ?? 'Local' };
}

function formatCountdown(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return days > 0 ? `${String(days)}d ${hh}:${mm}:${ss}` : `${hh}:${mm}:${ss}`;
}

export function SimulationPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { activeLeague, refreshSession, isSimulationAdmin, realtimeConnected } = useDream5State();
  const leagueId = activeLeague?.id ?? null;
  const [nowClientMs, setNowClientMs] = useState<number | null>(null);

  useEffect(() => {
    const updateTick = () => {
      setNowClientMs(Date.now());
    };
    const intervalId = window.setInterval(updateTick, 1000);
    const immediateId = window.setTimeout(updateTick, 0);
    return () => {
      window.clearInterval(intervalId);
      window.clearTimeout(immediateId);
    };
  }, []);

  const statusQuery = useQuery({
    queryKey: ['dev', 'league', leagueId, 'status'],
    queryFn: () => devApi.status(leagueId ?? ''),
    enabled: leagueId !== null && isSimulationAdmin,
    refetchInterval: 5_000,
  });

  const syncAll = async () => {
    await queryClient.invalidateQueries({ queryKey: ['leagues'] });
    await queryClient.invalidateQueries({ queryKey: ['league', leagueId] });
    await queryClient.invalidateQueries({ queryKey: ['dev', 'league', leagueId] });
    await refreshSession();
  };

  const simulateRoundMutation = useMutation({
    mutationFn: () => devApi.simulateRound(leagueId ?? ''),
    onSuccess: async (res) => {
      await syncAll();
      showToast({
        tone: 'success',
        message: `Jornada ${String(res.roundNumber)} simulada y precios actualizados.`,
      });
    },
    onError: (err) => {
      showToast({
        tone: 'error',
        message: err instanceof Error ? err.message : 'Error al simular jornada.',
      });
    },
  });

  const simulateMatchMutation = useMutation({
    mutationFn: () => devApi.simulateMatch(leagueId ?? ''),
    onSuccess: async () => {
      await syncAll();
      showToast({ tone: 'success', message: 'Partido individual simulado y acta guardada.' });
    },
    onError: (err) => {
      showToast({
        tone: 'error',
        message: err instanceof Error ? err.message : 'Error al simular partido.',
      });
    },
  });

  const advanceClockMutation = useMutation({
    mutationFn: (hours: number) => devApi.advanceClock(leagueId ?? '', hours),
    onSuccess: async (res) => {
      await syncAll();
      showToast({
        tone: 'success',
        message: `Reloj avanzado hasta ${new Date(res.newGameClockAt).toLocaleString('es-ES')}. Jornadas ejecutadas: ${res.simulatedRounds.length > 0 ? res.simulatedRounds.join(', ') : 'ninguna vencida todavía'}.`,
      });
    },
    onError: (err) => {
      showToast({
        tone: 'error',
        message: err instanceof Error ? err.message : 'No se pudo avanzar el reloj.',
      });
    },
  });

  const repriceMutation = useMutation({
    mutationFn: () => devApi.repriceMarket(leagueId ?? ''),
    onSuccess: async () => {
      await syncAll();
      showToast({
        tone: 'success',
        message: 'Mercado recalculado para los 540 jugadores de esta liga.',
      });
    },
    onError: (err) => {
      showToast({
        tone: 'error',
        message: err instanceof Error ? err.message : 'No se pudo recalcular el mercado.',
      });
    },
  });

  const finishSeasonMutation = useMutation({
    mutationFn: () => devApi.finishSeason(leagueId ?? '', true),
    onSuccess: async () => {
      await syncAll();
      showToast({
        tone: 'success',
        message: 'Temporada cerrada y nueva temporada mensual generada automáticamente.',
      });
    },
    onError: (err) => {
      showToast({
        tone: 'error',
        message: err instanceof Error ? err.message : 'No se pudo finalizar la temporada.',
      });
    },
  });

  const syncClockMutation = useMutation({
    mutationFn: () => devApi.syncClock(leagueId ?? ''),
    onSuccess: async (res) => {
      await syncAll();
      showToast({
        tone: 'success',
        title: 'Hora simulada sincronizada',
        message: `Reloj establecido a ${new Date(res.newGameClockAt).toLocaleString('es-ES')} (${res.activeSeasonName}, J${String(res.currentRoundNumber)}). Revertidos: ${String(res.revertedMatchesCount)} partidos, ${String(res.deletedFutureSeasonsCount)} temporada(s) futura(s).`,
      });
    },
    onError: (err) => {
      showToast({
        tone: 'error',
        message: err instanceof Error ? err.message : 'No se pudo sincronizar la hora simulada.',
      });
    },
  });

  if (!isSimulationAdmin) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 py-8 text-sm text-muted-foreground">
          <ShieldAlert className="h-5 w-5 text-amber-400" />
          Solo el administrador autorizado (`ivan.k@dream5.local`) puede acceder y ejecutar
          simulaciones manuales. El worker 24/7 continúa procesando el universo de forma automática.
        </CardContent>
      </Card>
    );
  }

  if (!activeLeague) {
    return <NoActiveLeagueCard />;
  }

  const anyBusy =
    simulateRoundMutation.isPending ||
    simulateMatchMutation.isPending ||
    advanceClockMutation.isPending ||
    repriceMutation.isPending ||
    finishSeasonMutation.isPending ||
    syncClockMutation.isPending;

  const status = statusQuery.data;

  const elapsedSinceFetchMs =
    status && nowClientMs !== null && statusQuery.dataUpdatedAt > 0
      ? Math.max(0, nowClientMs - statusQuery.dataUpdatedAt)
      : 0;
  const serverTimeMs = status ? Date.parse(status.serverTimeIso) : 0;
  const gameClockMs = status ? Date.parse(status.gameClockAt) : 0;
  const liveServerMs = serverTimeMs + elapsedSinceFetchMs;
  const liveLeagueMs = status
    ? !status.isAccelerated && Math.abs(gameClockMs - serverTimeMs) <= 120_000
      ? liveServerMs
      : !status.isAccelerated && gameClockMs > serverTimeMs + 1_000
        ? Math.max(gameClockMs, liveServerMs)
        : gameClockMs + elapsedSinceFetchMs
    : 0;

  const serverClock = status ? formatClockParts(liveServerMs, status.serverTimeZone) : null;
  const leagueClock = status ? formatClockParts(liveLeagueMs, status.serverTimeZone) : null;
  const nextMatchMs = status?.nextScheduledMatchAt ? Date.parse(status.nextScheduledMatchAt) : null;
  const nextMatchParts =
    nextMatchMs !== null && status ? formatClockParts(nextMatchMs, status.serverTimeZone) : null;
  const nextMatchRemainingMs =
    nextMatchMs !== null ? Math.max(0, nextMatchMs - liveLeagueMs) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Consola de simulación 24/7 y calendario"
        description={`Supervisa el reloj real del servidor host, las simulaciones automáticas y el calendario de ${activeLeague.name}.`}
      />

      {statusQuery.isError ? (
        <ErrorFallbackCard
          title="Error al consultar el estado de simulación"
          description={statusQuery.error instanceof Error ? statusQuery.error.message : 'Error'}
        />
      ) : statusQuery.isLoading || !status || !serverClock || !leagueClock ? (
        <LoadingSkeletonCard />
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="border-primary/30 bg-card/95">
              <CardContent className="space-y-3 pt-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                    <Server className="h-4 w-4 text-primary" />
                    Reloj real del servidor (PC Host)
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant={status.workerOnline ? 'success' : 'danger'}>
                      {status.workerOnline ? 'Worker 24/7 activo' : 'Worker offline'}
                    </Badge>
                    <Badge variant={realtimeConnected ? 'info' : 'warning'}>
                      <Radio className="h-3 w-3" />
                      {realtimeConnected ? 'Tiempo real' : 'Reconectando'}
                    </Badge>
                  </div>
                </div>
                <p
                  data-testid="server-live-clock-time"
                  className="font-display text-4xl font-extrabold tracking-wide text-foreground tabular-nums"
                >
                  {serverClock.timeText}
                </p>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span className="capitalize">{serverClock.dateText}</span>
                  <span>Zona: {serverClock.resolvedTz}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-3 pt-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                    <Clock className="h-4 w-4 text-primary" />
                    Reloj de la liga
                  </div>
                  <Badge variant={status.isAccelerated ? 'warning' : 'success'}>
                    {status.isAccelerated ? 'Modo acelerado' : 'Sincronizado 1:1 (24/7)'}
                  </Badge>
                </div>
                <p
                  data-testid="league-live-clock-time"
                  className="font-display text-4xl font-extrabold tracking-wide text-primary tabular-nums"
                >
                  {leagueClock.timeText}
                </p>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span className="capitalize">{leagueClock.dateText}</span>
                  <span>{status.season.name}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-4">
            <Card>
              <CardContent className="pt-3.5 sm:pt-5">
                <p className="text-[10px] text-muted-foreground uppercase sm:text-xs">
                  Próximo encuentro
                </p>
                {status.nextScheduledMatchAt && nextMatchParts && nextMatchRemainingMs !== null ? (
                  <>
                    <p className="mt-1 font-display text-lg font-bold text-foreground tabular-nums sm:text-xl">
                      {nextMatchRemainingMs === 0
                        ? 'En ejecución...'
                        : formatCountdown(nextMatchRemainingMs)}
                    </p>
                    <p className="mt-1 truncate text-[11px] font-medium text-primary sm:text-xs">
                      {(status.nextScheduledMatchLabel ?? 'Partido').replace(' @ ', ' vs ')} · J
                      {String(status.nextScheduledRound ?? '-')}
                    </p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground tabular-nums sm:text-[11px]">
                      {nextMatchParts.shortDateTimeText}
                    </p>
                  </>
                ) : (
                  <p className="mt-1 font-display text-base font-bold text-foreground sm:text-lg">
                    Temporada completa
                  </p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-3.5 sm:pt-5">
                <p className="text-[10px] text-muted-foreground uppercase sm:text-xs">
                  Jornada actual
                </p>
                <p className="mt-1 font-display text-lg font-bold text-primary tabular-nums sm:text-2xl">
                  {status.season.currentRoundNumber} / {status.season.totalRounds}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground sm:text-xs">
                  Próxima:{' '}
                  {status.nextScheduledRound
                    ? `J${String(status.nextScheduledRound)}`
                    : 'Completada'}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-3.5 sm:pt-5">
                <p className="text-[10px] text-muted-foreground uppercase sm:text-xs">
                  Partidos completados
                </p>
                <p className="mt-1 font-display text-lg font-bold text-foreground tabular-nums sm:text-2xl">
                  {status.completedMatchesCount}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground sm:text-xs">
                  Restantes: {status.scheduledMatchesRemaining}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-3.5 sm:pt-5">
                <p className="text-[10px] text-muted-foreground uppercase sm:text-xs">
                  Cola de eventos
                </p>
                <p className="mt-1 font-display text-lg font-bold text-foreground tabular-nums sm:text-2xl">
                  {status.pendingJobsCount}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground sm:text-xs">
                  Simulaciones pendientes
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Acciones rápidas de simulación</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <Button
                variant="primary"
                disabled={anyBusy || status.nextScheduledRound === null}
                onClick={() => {
                  simulateRoundMutation.mutate();
                }}
              >
                <Play className="h-4 w-4" />
                {simulateRoundMutation.isPending
                  ? 'Simulando jornada...'
                  : 'Simular siguiente jornada'}
              </Button>

              <Button
                variant="outline"
                disabled={anyBusy || status.scheduledMatchesRemaining === 0}
                onClick={() => {
                  simulateMatchMutation.mutate();
                }}
              >
                <FastForward className="h-4 w-4" />
                Simular 1 partido
              </Button>

              <Button
                variant="outline"
                disabled={anyBusy}
                onClick={() => {
                  advanceClockMutation.mutate(12);
                }}
              >
                <Clock className="h-4 w-4" />
                Avanzar reloj +12h
              </Button>

              <Button
                variant="outline"
                disabled={anyBusy}
                onClick={() => {
                  advanceClockMutation.mutate(24);
                }}
              >
                <Clock className="h-4 w-4" />
                Avanzar reloj +24h
              </Button>

              <Button
                variant="outline"
                disabled={anyBusy}
                onClick={() => {
                  repriceMutation.mutate();
                }}
              >
                <TrendingUp className="h-4 w-4" />
                Recalcular mercado
              </Button>

              <Button
                variant="outline"
                disabled={anyBusy}
                onClick={() => {
                  syncClockMutation.mutate();
                }}
              >
                <CalendarClock className="h-4 w-4" />
                {syncClockMutation.isPending
                  ? 'Sincronizando hora...'
                  : 'Establecer hora simulada según la actual'}
              </Button>

              <Button
                variant="danger"
                disabled={anyBusy}
                onClick={() => {
                  finishSeasonMutation.mutate();
                }}
              >
                <RefreshCw className="h-4 w-4" />
                Cerrar temporada y crear nueva
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Actividad reciente de la liga ({status.recentJobs.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              {status.recentJobs.length === 0 ? (
                <p className="text-muted-foreground">Sin ejecuciones registradas todavía.</p>
              ) : (
                status.recentJobs.map((job) => (
                  <div
                    key={job.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/80 bg-surface-deep/70 px-3 py-2"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant={
                          job.status === 'COMPLETED'
                            ? 'success'
                            : job.status === 'FAILED'
                              ? 'danger'
                              : 'warning'
                        }
                      >
                        {ACTIVITY_STATUS_LABELS[job.status] ?? job.status}
                      </Badge>
                      <span className="font-semibold text-foreground">
                        {ACTIVITY_LABELS[job.jobType] ?? job.jobType}
                      </span>
                      {job.targetRound ? (
                        <span className="text-muted-foreground">· Jornada {job.targetRound}</span>
                      ) : null}
                    </div>
                    <span className="text-muted-foreground tabular-nums">
                      {new Date(job.startedAt).toLocaleString('es-ES')}
                    </span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
