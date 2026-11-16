# Motor deportivo y simulación 24/7

El corazón deportivo de DREAM5 reside en `@dream5/simulation-engine` (paquete TypeScript puro sin dependencias de red, NestJS ni Prisma) y se ejecuta tanto de forma autónoma en `apps/worker` como bajo demanda desde la consola de simulación (`/simulation` o endpoints `/dev/leagues/:leagueId/*`).

## Flujo de simulación de una jornada

1. **Calendario de 58 jornadas (`scheduler.ts`):**
   - Cada temporada genera un _double round-robin_ equilibrado de 58 jornadas entre los 30 equipos de la liga (29 partidos como local y 29 como visitante por franquicia), distribuidos en el mes natural correspondiente dentro de la ventana diaria `08:00`–`20:00` UTC.
2. **Simulación determinista por semilla (`simulate-match.ts`):**
   - Cada encuentro utiliza una semilla reproducible derivada de la liga, temporada y partido.
   - Simula los 4 cuartos (y prórrogas si hay empate), repartiendo posesiones y minutos entre titulares y rotación según atributos (`offense`, `defense`, `playmaking`, `rebounding`, `athleticism`, `iq`), fatiga, rol y disponibilidad.
   - Registra `TeamMatchStat`, `PlayerMatchStat` y `MatchEvent` en PostgreSQL dentro de la misma transacción.
3. **Cálculo de **Dream Points** (`DP`), premio por victoria y mercado (`simulation-runner.ts`):**
   - Tras simular los 15 partidos de la jornada, `recalculateRoundStandingsInTx` inspecciona la alineación vigente (`Lineup`) de cada uno de los 30 equipos y suma únicamente los **Dream Points** de los 5 jugadores designados en `PG`, `SG`, `SF`, `PF`, `C`.
   - Acredita al ganador de cada encuentro finalizado un premio de **`teamRoundDp × 1.000` créditos** (`winRewardMillions`) de forma idempotente y actualiza `season.currentRoundNumber`.
   - Bloquea la alineación de la jornada simulada (`isLocked: true`), propaga automáticamente la configuración vigente a `roundNumber + 1` y ejecuta `repriceLeagueMarketInTx` para actualizar precios y variaciones al cierre de la jornada.
4. **Lesiones, expulsiones y progresión:**
   - Al término de cada partido simulado, los jugadores con partidos de sanción o lesión restantes reducen su contador `gamesOutRemaining` (volviendo a `HEALTHY` cuando llega a 0) y se aplican nuevas incidencias o evaluaciones de rol cada `evaluateEveryGames` encuentros.

## Operación continua 24/7 (`apps/worker`)

El proceso `apps/worker` registra en Redis/BullMQ (`LeagueCronScheduler`):

- **`dream5-24x7-tick`:** comprueba periódicamente las ligas `ACTIVE` y encola la simulación de toda jornada cuya hora programada sea menor o igual al reloj operativo correspondiente, así como los cambios de temporada pendientes al completar la jornada 58.
- **`dream5-hourly-market`:** recalcula los precios de mercado de forma periódica emitiendo eventos `league:market.updated` hacia Redis Pub/Sub → Socket.IO.
