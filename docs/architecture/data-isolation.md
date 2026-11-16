# Aislamiento de datos entre ligas

En **DREAM5**, cada liga privada constituye un universo deportivo y económico completamente independiente. Un traspaso, partido simulado, lesión, expulsión, cambio de rol o variación de precio en una liga **nunca** puede propagarse a otra liga.

## Mecanismos implementados en base de datos

1. **Catálogo global de solo lectura (`teams`, `players`):**
   - Almacena únicamente las 30 plantillas de franquicia y los 540 jugadores plantilla generados inicialmente por `ensureCatalogSeeded`.
   - Ninguna acción de juego (partido, lesión, traspaso o recalculo de mercado) escribe en estas tablas.
2. **Clonado completo por liga (`league_teams`, `player_instances`, `roster_slots`):**
   - Cada llamada a `instantiateLeague` clona los 30 equipos en `league_teams` y los 540 jugadores en `player_instances` vinculados a su `leagueId`.
   - Existen restricciones de unicidad por liga (`@@unique([leagueId, code])` en equipos, `@@unique([leagueId, templatePlayerId])` en instancias de jugador y `@@unique([playerInstanceId, leagueId])` en _slots_ de plantilla).
3. **Integridad referencial compuesta (`(leagueId, id)`):**
   - Las relaciones de calendario (`matches`), alineaciones (`lineups`), estadísticas (`player_match_stats`, `team_match_stats`), economía (`market_history`) y traspasos (`transfer_offers`, `transfer_history`, `transactions`) validan e indexan explícitamente el `leagueId`.
   - PostgreSQL rechaza a nivel relacional asignar un jugador o equipo de una liga dentro de un _slot_, partido u oferta de otra liga.
4. **Aislamiento de autorización en HTTP y WebSockets:**
   - Todos los endpoints bajo `/leagues/:leagueId/*` pasan por `LeagueMemberGuard` (o `LeaguePresidentGuard`), que exige registro previo del usuario en `league_members` para ese `leagueId` concreto.
   - `RealtimeGateway` verifica la membresía en `league_members` antes de unir un _socket_ a la sala `league:<leagueId>`.

## Verificación automática

La suite [`packages/database/src/league-domain.integration.test.ts`](../../packages/database/src/league-domain.integration.test.ts) comprueba contra PostgreSQL real que simular jornadas, recalcular precios de mercado y ejecutar traspasos en una Liga A deja intactos el reloj, clasificaciones, plantillas y precios de los 540 jugadores de una Liga B.
