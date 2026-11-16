import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarClock,
  Clock,
  FastForward,
  Play,
  RefreshCw,
  ShieldAlert,
  TrendingUp,
} from 'lucide-react';

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

export function SimulationPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { activeLeague, refreshSession, isSimulationAdmin } = useDream5State();
  const leagueId = activeLeague?.id ?? null;

  const statusQuery = useQuery({
    queryKey: ['dev', 'league', leagueId, 'status'],
    queryFn: () => devApi.status(leagueId ?? ''),
    enabled: leagueId !== null && isSimulationAdmin,
    refetchInterval: 8_000,
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Consola de simulación 24/7 y calendario"
        description={`Acelera jornadas, partidos, mercado y reloj de juego en ${activeLeague.name} sin alterar ninguna otra liga.`}
      />

      {statusQuery.isError ? (
        <ErrorFallbackCard
          title="Error al consultar el estado de simulación"
          description={statusQuery.error instanceof Error ? statusQuery.error.message : 'Error'}
        />
      ) : statusQuery.isLoading || !status ? (
        <LoadingSkeletonCard />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardContent className="pt-5">
                <p className="text-xs text-muted-foreground uppercase">Reloj de liga</p>
                <p className="mt-1 font-display text-lg font-bold text-foreground">
                  {new Date(status.gameClockAt).toLocaleString('es-ES')}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{status.season.name}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <p className="text-xs text-muted-foreground uppercase">Jornada actual</p>
                <p className="mt-1 font-display text-2xl font-bold text-primary tabular-nums">
                  {status.season.currentRoundNumber} / {status.season.totalRounds}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Próxima:{' '}
                  {status.nextScheduledRound
                    ? `J${String(status.nextScheduledRound)}`
                    : 'Completada'}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <p className="text-xs text-muted-foreground uppercase">Partidos completados</p>
                <p className="mt-1 font-display text-2xl font-bold text-foreground tabular-nums">
                  {status.completedMatchesCount}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Restantes: {status.scheduledMatchesRemaining}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <p className="text-xs text-muted-foreground uppercase">Cola de eventos</p>
                <p className="mt-1 font-display text-2xl font-bold text-foreground tabular-nums">
                  {status.pendingJobsCount}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">Simulaciones pendientes</p>
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
                    <span className="text-muted-foreground">
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
