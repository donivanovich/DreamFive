# Arquitectura general de DreamFive

DreamFive sigue una arquitectura de **monolito modular Full Stack** con procesamiento asíncrono desacoplado en **workers 24/7** y un **motor de simulación deportivo independiente** en TypeScript puro.

## Diagrama de componentes

```text
  [Navegador / SPA + SSR]
         ▲       │
   HTTP  │       │ Socket.IO (room league:<leagueId>)
         │       ▼
  [apps/web — React + TanStack Start + TanStack Query]
         │
         │ HTTP REST (/auth, /leagues, /teams, /lineup, /transfers, /dev...)
         ▼
  [apps/api — NestJS + Fastify + Socket.IO Gateway]
      │          │                       ▲
      │ Prisma   │ BullMQ (productor)    │ Redis Pub/Sub (leagueRealtimeEvents)
      ▼          ▼                       │
  [PostgreSQL 18]          [Redis 8 (AOF)]
      ▲                          ▲       │
      │ Prisma                   │ BullMQ│
      └────── [apps/worker (Standalone)] ┘
                        │
                        ▼
        [packages/simulation-engine (TS puro)]
```

## Responsabilidad de cada paquete

- **`packages/shared` (`@dreamfive/shared`):** enumeraciones (`Position`, `PlayerRole`, `AvailabilityStatus`, `LeagueRole`, `LeagueStatus`, `TransferStatus`, `MatchStatus`, `MarketMode`), esquemas Zod compartidos, DTOs de respuesta, constantes de colas (`QUEUE_NAMES`, `JOB_NAMES`), eventos Socket.IO (`SOCKET_EVENTS`) y `PROVISIONAL_GAME_CONFIG`.
- **`packages/simulation-engine` (`@dreamfive/simulation-engine`):** lógica deportiva pura y determinista sin dependencias de NestJS, React o Prisma:
  - Generación inicial del catálogo de 30 equipos y 540 jugadores ficticios (`generateInitialUniverseCatalog`).
  - Generador de calendario _double round-robin_ de 58 jornadas (`generateDoubleRoundRobinFixtures`).
  - Simulación de partido cuarto a cuarto con prórroga, posesiones, box-score y jugada a jugada (`simulateBasketballMatch`).
  - Cálculo de **Dream Points** (`DP`), lesiones, expulsiones, progresión cada N partidos y revalorización de mercado.
- **`packages/database` (`@dreamfive/database`):** esquema Prisma 7 (`prisma/schema.prisma`), migraciones SQL, factoría `createPrismaClient` con `@prisma/adapter-pg`, utilidades criptográficas (`hashPassword`/`verifyPassword`), y servicios transaccionales de dominio compartidos entre API y Worker (`league-bootstrap.ts`, `simulation-runner.ts`, `transfer-engine.ts`).
- **`apps/api` (`@dreamfive/api`):** servidor HTTP Fastify + Swagger dev (`/docs`) + `RealtimeGateway` Socket.IO autenticado + módulos de dominio, envío SMTP real (Gmail / SMTP configurable) y subida local de avatares.
- **`apps/worker` (`@dreamfive/worker`):** proceso independiente encargado de ejecutar los planificadores 24/7 (`LeagueCronScheduler`) y consumir las 6 colas BullMQ (`simulation`, `market`, `injuries`, `progression`, `rankings`, `seasons`).
- **`apps/web` (`@dreamfive/web`):** interfaz web bilingüe (inglés por defecto y español configurable) con temas claro/oscuro, colores de resaltado personalizables, TanStack Start, React 19 y TanStack Query v5 sincronizada mediante `useLeagueRealtime`.
