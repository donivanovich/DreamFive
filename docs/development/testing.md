# Estrategia de pruebas y verificación

DreamFive cuenta con 4 niveles de verificación automatizada para garantizar calidad estática y comportamiento real en ejecución.

## 1. Validación estática y pruebas de todo el monorepo

```bash
pnpm run check
```

Ejecuta secuencialmente:

1. `pnpm run format:check` (Prettier en todo el repositorio).
2. `pnpm run lint` (ESLint estricto con `--max-warnings=0`).
3. `pnpm run typecheck` (compila paquetes `@dreamfive/*` y verifica TypeScript en modo estricto en los 7 proyectos).
4. `pnpm run test` (todas las suites Vitest del monorepo).

## 2. Pruebas unitarias del motor deportivo y utilidades

- **`packages/simulation-engine/src/engine.test.ts`:** valida determinismo del catálogo (30 equipos × 18 jugadores = 540 jugadores), calendario de 58 jornadas × 15 partidos, simulación de partidos, scoring y progresión sin dependencias de red ni BD.
- **`packages/shared/src/constants/queue-names.test.ts`:** valida integridad de nombres de colas BullMQ.
- **`apps/web/src/lib/trade-rules.test.ts` y `utils.test.ts`:** validan reglas del constructor de traspasos en frontend.
- **`apps/api` y `apps/worker` (`env.schema.test.ts`, `health.controller.test.ts`):** validan fail-fast de configuración y endpoints de salud.

## 3. Pruebas de integración reales (PostgreSQL + NestJS Fastify)

- **`packages/database/src/league-domain.integration.test.ts`:** ejecuta transacciones reales contra PostgreSQL (`DATABASE_URL` del `.env`):
  - Aislamiento completo entre Liga A y Liga B (simulación, precios, plantillas).
  - Índice único parcial que bloquea crear una 2.ª presidencia activa para un mismo usuario.
  - Cálculo de `FantasyScore` exclusivamente sobre los 5 titulares alineados.
  - Herencia automática de puntos del equipo CPU al aceptar invitación tardía.
  - Rechazo de traspasos inválidos (`< 50 %` valor o ruptura de 18 jugadores/5 posiciones), ejecución ACID, rechazo `409` ante doble aceptación idempotente y salto de temporada mensual manteniendo jugadores e historial.
- **`apps/api/src/app.integration.test.ts`:** levanta `AppModule.forRoot(env)` sobre `FastifyAdapter` real y verifica por HTTP `.inject(...)`: registro + verificación por correo, `#D5-XXXX`, bloqueo por partidos en traspasos, restricción administrativa de simulación, invitación + aceptación con Dream Points heredados, `PUT /lineup` y revocación tras `POST /auth/logout`.

## 4. Pruebas End-to-End en navegador real (Playwright)

Con todo el stack dockerizado (`pnpm docker:up`) levantado en `http://localhost:3000`:

```bash
PLAYWRIGHT_BASE_URL=http://localhost:3000 pnpm run test:e2e
```

Incluye:

- [`apps/web/e2e/smoke.spec.ts`](../../apps/web/e2e/smoke.spec.ts): idioma por defecto inglés, restricción de `Simulation` a `ivan.k@dreamfive.local`, recorrido completo por todas las secciones (incluido `Mail`) y menú móvil (`390px`) con `0` errores de consola.
- [`apps/web/e2e/full-stack.spec.ts`](../../apps/web/e2e/full-stack.spec.ts): creación de liga privada, alineación con persistencia tras `page.reload()`, cambio de aspecto e idioma, bloqueo directo de `/change-password`, bandeja `Mail`, selector de franquicia/jugador con desglose completo de Dream Points, simulación administrativa con `ivan.k@dreamfive.local` y bloqueos por partido en traspasos.
