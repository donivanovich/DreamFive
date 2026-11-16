# Esquema de base de datos PostgreSQL y Prisma 7

El esquema completo está definido en [`packages/database/prisma/schema.prisma`](../../packages/database/prisma/schema.prisma) y migrado mediante las migraciones en `packages/database/prisma/migrations/` (inicialización, avatares/verificación/bloqueos por partidos).

## Resumen de grupos de tablas

### 1. Identidad, sesiones, verificación y preferencias

- `users` (`email` único, `emailVerifiedAt`, `passwordHash`, `role`).
- `user_profiles` (`username`, `tag` único con formato `#D5-XXXX`, `initials`, `avatarUrl`, `preferencesJson`).
- `user_sessions` (`tokenHash` SHA-256 único, `expiresAt`, `revokedAt`).
- `email_verification_tokens` y `password_reset_tokens` (códigos de 6 dígitos y enlaces únicos con expiración y un solo uso).

### 2. Catálogo base inmutable

- `teams`: los 30 equipos base ficticios (`code`, `city`, `name`, `shortName`, `conference`, `primaryColor`).
- `players`: los 540 jugadores ficticios base (`slug`, `position`, `initialRole`, `age`, `basePriceMillions` y atributos iniciales).

### 3. Ligas, membresía e invitaciones

- `leagues`: `id`, `name`, `presidentUserId`, `status` (`ACTIVE` | `COMPLETED`), `marketMode` (`LEAGUE_ISOLATED` | `GLOBAL_HYBRID`), `gameClockAt`, `simulationSeed`, `scoringConfigJson`.
  - **Índice único parcial SQL:** `"leagues_one_active_presidency_per_user"` sobre `(president_user_id)` donde `status = 'ACTIVE'`.
- `league_members`: relaciona `leagueId`, `userId`, `leagueTeamId` y `role` (`PRESIDENT` | `MEMBER`), con unicidad `(leagueId, userId)` y `(leagueTeamId, leagueId)`.
- `league_invitations`: invitaciones emitidas por el presidente hacia un `invitedTag` (`PENDING`, `ACCEPTED`, `REJECTED`).

### 4. Universo deportivo independiente por liga

- `league_teams`: 30 equipos instanciados por liga (`isCpuControlled`, `budgetMillions`, `totalFantasyPoints`, `wins`, `losses`, `rank`).
- `player_instances`: 540 jugadores instanciados por liga con su estado dinámico (`role`, `priceMillions`, `priceDeltaMillions`, `status`, `gamesOutRemaining`, atributos actualizados y promedios de temporada).
- `roster_slots`: asignación actual de cada jugador a su `leagueTeamId` dentro de la liga (`@@unique([playerInstanceId, leagueId])`).

### 5. Temporadas, calendario y partidos

- `seasons`: temporadas mensuales (`seasonNumber`, `calendarYear`, `calendarMonth`, `daysInMonth`, `totalRounds = 58`, `currentRoundNumber`, `status`).
- `matches`: 870 enfrentamientos por temporada (`roundNumber`, `homeTeamId`, `awayTeamId`, `scheduledAt`, `status`, marcadores, prórrogas, `winRewardPaid` y `winRewardMillions`).
- `lineups`: quinteto titular guardado por equipo y jornada (`pgPlayerId`, `sgPlayerId`, `sfPlayerId`, `pfPlayerId`, `cPlayerId`, `isLocked`).
- `team_match_stats`, `player_match_stats` y `match_events`: acta completa y eventos de cada encuentro.
- `fantasy_scores`, `standings`: puntuación por jornada (calculada únicamente a partir de los 5 titulares) y clasificación acumulada.

### 6. Lesiones, economía, traspasos y auditoría

- `injuries` y `suspensions`: bajas activas y resueltas por partidos restantes.
- `market_history` y `player_progression_logs`: historial económico y cambios de rol/atributos por liga.
- `transfer_offers` (con contadores de partidos jugados `rejectedAtTeamMatches` para bloquear **1 partido** tras rechazo a ambos jugadores), `player_instances` (`tradeLockMatchesRemaining` / `tradeLockedUntilTeamMatches` para bloqueo de **5 partidos** tras traspaso completado), `transactions` (`idempotencyKey` único) y `transfer_history`.
- `simulation_jobs`: bitácora persistente de simulaciones de ronda, partido, mercado y cambio de temporada ejecutadas por API o Worker.
