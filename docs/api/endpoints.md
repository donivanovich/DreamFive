# Referencia de endpoints REST y WebSockets

La API corre bajo **NestJS + Fastify** (puerto `3101` en `.env`, Swagger interactivo en `/docs` solo en desarrollo). Todas las rutas protegidas aceptan cookie `HttpOnly` (`dream5_session`) o cabecera `Authorization: Bearer <token>`.

## Endpoints públicos y de usuario

| Método y ruta                           | Guard / Autenticación      | Descripción                                                                                              |
| --------------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------- |
| `GET /health`                           | Público                    | Estado básico _liveness_ de la API                                                                       |
| `GET /health/ready`                     | Público                    | Comprobación real de PostgreSQL y Redis                                                                  |
| `POST /auth/register`                   | Público + `RateLimitGuard` | Registra usuario (`^[a-zA-Z0-9._-]+$`), asigna `#D5-XXXX` y envía código de 6 dígitos por SMTP           |
| `POST /auth/verify-email`               | Público + `RateLimitGuard` | Valida el código de 6 dígitos recibido por correo y abre sesión autenticada                              |
| `POST /auth/resend-verification`        | Público + `RateLimitGuard` | Reenvía un nuevo código de verificación de 6 dígitos                                                     |
| `POST /auth/login`                      | Público + `RateLimitGuard` | Valida credenciales (`403 EMAIL_NOT_VERIFIED` si falta confirmar el correo) y emite sesión               |
| `GET /auth/password-reset/validate`     | Público                    | Comprueba si el token recibido por correo en `/change-password?token=...` es válido                      |
| `POST /auth/password-reset/confirm`     | Público + `RateLimitGuard` | Confirma y guarda la nueva contraseña invalidando el token de un solo uso y revocando sesiones previas   |
| `POST /auth/logout`                     | Cookie / Bearer            | Revoca el hash de sesión en PostgreSQL y limpia la cookie                                                |
| `GET /auth/session`                     | Público                    | Comprueba sesión opcional y devuelve `{ user: null }` o el usuario autenticado                           |
| `GET /auth/me`                          | `SessionAuthGuard`         | Devuelve el usuario autenticado actual (`401` si no hay sesión)                                          |
| `GET /users/me`                         | `SessionAuthGuard`         | Perfil actual                                                                                            |
| `PATCH /users/me/profile`               | `SessionAuthGuard`         | Actualiza `username`                                                                                     |
| `POST /users/me/email-change/request`   | `SessionAuthGuard`         | Verifica `currentPassword` y envía código de 6 dígitos al nuevo correo propuesto                         |
| `POST /users/me/email-change/confirm`   | `SessionAuthGuard`         | Valida el código de 6 dígitos y confirma el nuevo correo en la cuenta                                    |
| `POST /users/me/password-reset/request` | `SessionAuthGuard`         | Envía enlace único por correo hacia `/change-password?token=...`                                         |
| `POST /users/me/avatar`                 | `SessionAuthGuard`         | Sube imagen de perfil multipart (`PNG`, `JPG`, `WEBP`, máx. 5 MB) servida en `/uploads/avatars/*`        |
| `DELETE /users/me/avatar`               | `SessionAuthGuard`         | Elimina la foto de perfil personalizada del usuario                                                      |
| `PATCH /users/me/preferences`           | `SessionAuthGuard`         | Persiste preferencias competitivas, `themeMode` (`dark`/`light`), `accentColor` y `language` (`en`/`es`) |
| `GET /users/search?q=`                  | `SessionAuthGuard`         | Busca mánagers por alias o etiqueta `#D5-...`                                                            |

## Ligas e invitaciones

| Método y ruta                            | Guard                  | Descripción                                                                                               |
| ---------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------- |
| `GET /leagues`                           | `SessionAuthGuard`     | Lista todas las ligas en las que participa el usuario                                                     |
| `POST /leagues`                          | `SessionAuthGuard`     | Crea liga aislada (30 equipos, 540 jugadores, 58 jornadas); falla con `409` si ya preside una liga activa |
| `GET /leagues/:leagueId`                 | `LeagueMemberGuard`    | Detalle de la liga, temporada activa y participantes humanos                                              |
| `GET /invitations/pending`               | `SessionAuthGuard`     | Lista invitaciones pendientes recibidas por el usuario                                                    |
| `GET /leagues/:leagueId/invitations`     | `LeaguePresidentGuard` | Lista invitaciones emitidas en la liga                                                                    |
| `POST /leagues/:leagueId/invitations`    | `LeaguePresidentGuard` | Invita por etiqueta exacta `#D5-XXXX`                                                                     |
| `POST /invitations/:invitationId/accept` | `SessionAuthGuard`     | Asigna equipo CPU disponible al azar heredando sus Dream Points actuales                                  |
| `POST /invitations/:invitationId/reject` | `SessionAuthGuard`     | Rechaza invitación pendiente                                                                              |

## Operación dentro de la liga (`LeagueMemberGuard`)

| Método y ruta                                        | Descripción                                                                                                                                                                                                                                   |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /leagues/:leagueId/teams`                       | Los 30 equipos de la liga ordenados con clasificación y presupuesto                                                                                                                                                                           |
| `GET /leagues/:leagueId/teams/:teamId`               | Ficha del equipo y su plantilla exacta de 18 jugadores                                                                                                                                                                                        |
| `GET /leagues/:leagueId/players`                     | Explorador paginado y filtrado de los 540 jugadores (`search`, `position`, `role`, `status`, `teamId`, `sortBy` [`name`, `position`, `role`, `status`, `pts`, `reb`, `ast`, `fp`, `price`, `delta`, `overall`], `sortDir`, `limit`, `offset`) |
| `GET /leagues/:leagueId/players/:playerId`           | Ficha de jugador, 6 atributos, estadísticas recientes e historial de precio                                                                                                                                                                   |
| `GET /leagues/:leagueId/lineup`                      | Quinteto titular y estado de bloqueo (`isLocked`) de la próxima jornada (o `?roundNumber=`)                                                                                                                                                   |
| `PUT /leagues/:leagueId/lineup`                      | Guarda los 5 titulares (`pgPlayerId`, `sgPlayerId`, `sfPlayerId`, `pfPlayerId`, `cPlayerId`) si la jornada sigue abierta                                                                                                                      |
| `GET /leagues/:leagueId/matches`                     | Calendario filtrable (`roundNumber`, `teamId`, `status`), incluyendo `winRewardMillions` en partidos finalizados                                                                                                                              |
| `GET /leagues/:leagueId/matches/:matchId`            | Acta de partido, `teamStats`, `playerStats` y eventos jugada a jugada                                                                                                                                                                         |
| `GET /leagues/:leagueId/rankings`                    | Tabla completa de 30 equipos y desglose reciente de los 5 titulares del usuario                                                                                                                                                               |
| `GET /leagues/:leagueId/statistics`                  | Líderes estadísticos de la liga                                                                                                                                                                                                               |
| `GET /leagues/:leagueId/market`                      | Top subidas, bajadas, jugadores más caros y registros recientes de `market_history`                                                                                                                                                           |
| `GET /leagues/:leagueId/transfers`                   | Ofertas pendientes, cerradas, bloqueos activos por partidos (`blockedPlayers`) e historial oficial `transfer_history`                                                                                                                         |
| `POST /leagues/:leagueId/transfers`                  | Propone traspaso con validación ACID (18 jugadores, 5 posiciones, ≥ 50 % valor, bloqueo 1 partido en rechazos y 5 partidos tras fichaje)                                                                                                      |
| `POST /leagues/:leagueId/transfers/:offerId/respond` | Responde `ACCEPT` o `REJECT`                                                                                                                                                                                                                  |
| `POST /leagues/:leagueId/transfers/:offerId/accept`  | Acepta oferta entrante pendiente de forma idempotente                                                                                                                                                                                         |
| `POST /leagues/:leagueId/transfers/:offerId/reject`  | Rechaza oferta entrante pendiente (bloquea 1 partido a ambos jugadores implicados)                                                                                                                                                            |
| `POST /leagues/:leagueId/transfers/:offerId/cancel`  | Retira una oferta saliente enviada por tu equipo                                                                                                                                                                                              |
| `GET /leagues/:leagueId/seasons`                     | Lista historial de temporadas de la liga                                                                                                                                                                                                      |
| `POST /leagues/:leagueId/seasons/advance`            | Solo administrador de simulación (`ivan.k@dream5.local` via `AdminSimulationGuard`): avanza de temporada                                                                                                                                      |

## Consola de simulación (`AdminSimulationGuard` — solo `ivan.k@dream5.local`)

| Método y ruta                                | Descripción                                                          |
| -------------------------------------------- | -------------------------------------------------------------------- |
| `GET /dev/leagues/:leagueId/status`          | Reloj de liga, jornada, partidos restantes y últimos `SimulationJob` |
| `POST /dev/leagues/:leagueId/simulate-round` | Simula la siguiente jornada (o `roundNumber`)                        |
| `POST /dev/leagues/:leagueId/simulate-match` | Simula 1 partido programado                                          |
| `POST /dev/leagues/:leagueId/advance-clock`  | Adelanta el reloj (`hours`) y simula jornadas vencidas               |
| `POST /dev/leagues/:leagueId/reprice-market` | Recalcula precios de mercado para los 540 jugadores                  |
| `POST /dev/leagues/:leagueId/finish-season`  | Cierra temporada vigente y genera la siguiente mensual               |

## Tiempo real (Socket.IO)

- **Salas autenticadas:** el cliente se suscribe mediante `league:room.join` / `league:room.leave` con `{ leagueId }` tras validar membresía.
- **Eventos emitidos hacia la sala `league:<leagueId>`:**
  - `league:match.updated`
  - `league:round.completed`
  - `league:standings.updated`
  - `league:market.updated`
  - `league:transfer.updated`
  - `league:season.rollover`
