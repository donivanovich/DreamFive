# Decisiones técnicas de arquitectura (ADR)

Este documento resume las decisiones implementadas en el prototipo Full Stack de **DreamFive**.

## ADR-01: Lógica transaccional compartida en `@dreamfive/database`

- **Decisión:** los servicios críticos que mutan el universo de una liga (`instantiateLeague`, `joinLeagueWithRandomTeamInTx`, `simulateRoundForLeague`, `repriceLeagueMarket`, `advanceSeasonForLeague`, `createAndEvaluateTransferOffer`, `executeAcceptedTransferInTx`) residen en `packages/database/src/services/`.
- **Motivo:** tanto `apps/api` (acciones síncronas del usuario o consola `/simulation`) como `apps/worker` (trabajos 24/7 sin usuarios conectados) ejecutan exactamente las mismas garantías ACID y reglas de negocio, evitando divergencias entre el modo automático y las herramientas de prueba.

## ADR-02: Límite de 1 presidencia activa reforzado en SQL

- **Decisión:** además de la comprobación previa en `LeaguesService` (`409 Conflict`), la migración inicial (`20261113233554_init/migration.sql`) crea un índice único parcial:
  `CREATE UNIQUE INDEX "leagues_one_active_presidency_per_user" ON "leagues" ("president_user_id") WHERE status = 'ACTIVE';`
- **Motivo:** incluso bajo condiciones de carrera con dos peticiones concurrentes, PostgreSQL impide físicamente que un mismo usuario presida dos ligas activas simultáneamente.

## ADR-03: Comunicación Worker → API → Cliente vía Redis Pub/Sub

- **Decisión:** `apps/worker` nunca abre conexiones WebSocket hacia los navegadores. Al completar una simulación, actualización de mercado o salto de temporada, publica un evento JSON estructurado en el canal Redis `dreamfive:realtime:league-events` (`REDIS_CHANNELS.leagueRealtimeEvents`). `apps/api` se suscribe en `RealtimeService` y retransmite únicamente a la sala autenticada `league:<leagueId>`.
- **Motivo:** mantiene al _worker_ completamente desacoplado de HTTP/WebSockets y permite escalar horizontalmente múltiples instancias de _worker_.

## ADR-04: Identidad de mánager y autenticación sin dependencias externas

- **Decisión:** el hash de contraseñas emplea `crypto.scrypt` + _salt_ aleatorio de 16 bytes + comparación en tiempo constante (`crypto.timingSafeEqual`). Las sesiones utilizan tokens opacos de 32 bytes cuyo digest SHA-256 (`tokenHash`) se almacena en `user_sessions`, entregando cookie `HttpOnly` y cabecera `Bearer`.
- **Motivo:** cero dependencias nativas C++ problemáticas en Windows, revocación inmediata en servidor al cerrar sesión (`POST /auth/logout`) y compatibilidad directa tanto con SSR como con clientes SPA.

## ADR-05: Centralización de reglas provisionales en `PROVISIONAL_GAME_CONFIG`

- **Decisión:** las ponderaciones de **Dream Points** (`DP`), probabilidades exactas de lesión/expulsión, frecuencia de evaluación de progresión, presupuesto inicial, bloqueos de traspasos por partidos (`1` tras rechazo, `5` tras fichaje) y umbral automático de equipos CPU residen en `PROVISIONAL_GAME_CONFIG` (`packages/shared/src/constants/index.ts`), visibles también en UI (`/settings`).
- **Motivo:** permite probar el juego de extremo a extremo con resultados coherentes dejando explícito qué números están sujetos a calibración futura.
