# Reglas oficiales de juego y configuración provisional

DreamFive respeta íntegramente la referencia funcional **v0.3** y distingue claramente entre **reglas fijas de dominio** (`LEAGUE_RULES`) y **parámetros provisionales** (`PROVISIONAL_GAME_CONFIG`) definidos en [`packages/shared/src/constants/index.ts`](../../packages/shared/src/constants/index.ts).

## Reglas fijas vigentes (`LEAGUE_RULES`)

| Concepto                 | Regla vigente                                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Equipos por liga         | **30 equipos ficticios** instanciados de forma independiente                                                       |
| Tamaño de plantilla      | Exactamente **18 jugadores** por equipo                                                                            |
| Cobertura de posiciones  | Al menos **1 jugador** en cada posición (`PG`, `SG`, `SF`, `PF`, `C`)                                              |
| Quinteto titular         | **5 titulares** (uno por posición); **solo los 5 titulares suman puntos**                                          |
| Límite de participantes  | Máximo **30 mánagers humanos** por liga privada                                                                    |
| Presidencias por usuario | Máximo **1 liga activa presidida** por usuario (`409 Conflict` e índice SQL)                                       |
| Duración de temporada    | **58 jornadas** (ida y vuelta completa, **15 partidos** por jornada)                                               |
| Traspasos                | Permitidos entre posiciones distintas si se mantienen 18 jugadores, 5 posiciones y **≥ 50 %** del valor solicitado |
| Incorporación tardía     | El usuario que acepta invitación recibe un equipo CPU libre al azar y **hereda sus puntos acumulados**             |

## Reglas provisionales abiertas (`PROVISIONAL_GAME_CONFIG`)

> Estos valores permiten ejecutar y calibrar el prototipo Full Stack actual sin fijarlos como reglas definitivas del diseño final. También pueden consultarse desde la página `/settings` en la interfaz web.

- **Ponderación estadística (**Dream Points**):** `pts`, `reb`, `ast`, `stl`, `blk`, `tov`, `pf`, `min` configurables por bloque (`scoringWeights`).
- **Bloqueo de alineación:** `lockMinutesBeforeTipoff: 5` minutos antes del salto inicial del primer partido de la jornada; `autoSubstituteUnavailable: false` (no sustituye lesionados automáticamente salvo configuración futura).
- **Lesiones y expulsiones:** probabilidad base de lesión (`baseInjuryChancePerGame: 0.014`), duda física (`questionableChancePerGame: 0.02`), baja de `1` a `4` partidos y probabilidades de expulsión diferenciadas por rol (`ejectionChanceByRole`).
- **Progresión:** evaluación cada `5` partidos jugados en temporada (`evaluateEveryGames: 5`, `promoteMinFpDelta: 4.5`, `demoteMaxFpDelta: -4.5`).
- **Economía y traspasos CPU:** presupuesto inicial estándar de `25 M$`, premio por victoria de `1.000` créditos por **Dream Point** obtenido en la jornada (`winRewardPerFantasyPoint: 1000`), sensibilidad de mercado `0.06`, rango de valoración `0.5 M$` – `45 M$`, evaluación automática por equipos CPU (`cpuAcceptMinRatio: 0.96`), bloqueo de **1 partido** tras oferta rechazada para ambos jugadores implicados (`rejectionCooldownMatches: 1`), bloqueo de **5 partidos** para jugadores adquiridos en un traspaso completado (`acquiredPlayerLockMatches: 5`) y caducidad por defecto de ofertas pendientes (`48` horas).
- **Reinicio mensual (`seasonReset`):** conserva instancias de jugadores (`keepPlayers: true`) e historial de traspasos (`keepTradeHistory: true`), reiniciando **Dream Points**, clasificaciones y estados físicos al comenzar la temporada siguiente.
