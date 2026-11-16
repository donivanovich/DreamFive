# `@dream5/web` — Frontend DREAM5

Aplicación web SSR/cliente de **DREAM5** construida con **TanStack Start**, **React 19**, **Tailwind CSS v4**, primitivas estilo **shadcn/ui** y **lucide-react**.

> **Estado actual:** **prototipo visual completo sobre datos ficticios de ejemplo (`src/data/mocks.ts`)**. Todas las vistas de producto son navegables e interactivas en cliente (cambio de liga activa, alineación titular, filtros, previsualización de traspasos y preferencias de interfaz), **sin conexión todavía con `apps/api`, PostgreSQL, Redis, Socket.IO ni motor de simulación**.

## Identidad visual y diseño

- **Marca visible:** `DREAM5` / `FANTASY MANAGER` (el nombre de paquete `@dream5/web` se mantiene internamente por compatibilidad del monorepo).
- **Estética:** interfaz oscura deportiva (`#0b1016` fondo base, `#080c11` barra lateral/cabecera, `#0d141d` tarjetas, `#1d2836` bordes, `#ff8800` naranja primario, `#0be5ff` acento informativo).
- **Tipografía:** `Barlow Condensed` para cabeceras y marcadores numéricos (`tabular-nums`), combinada con `IBM Plex Sans` para cuerpo y tablas.
- **Navegación:** barra lateral fija en escritorio (`240px`) + drawer responsive en móvil/tablet + cabecera con selector de liga activa y perfil del mánager (`#D5-4821`).

## Rutas implementadas (prototipo visual)

| Ruta               | Vista            | Finalidad                                                                                                    |
| ------------------ | ---------------- | ------------------------------------------------------------------------------------------------------------ |
| `/` y `/dashboard` | Dashboard        | Resumen de liga activa, KPIs, clasificación compacta, próximos partidos, resultados, mercado y traspasos     |
| `/leagues`         | Mis ligas        | Ligas privadas independientes (máx. 30 participantes, 1 presidencia por usuario), selector y modales preview |
| `/teams`           | Mi equipo        | Plantilla de 18 jugadores, conteo posicional (`PG..C`), vista tabla/tarjetas y ficha modal                   |
| `/lineup`          | Alineación       | Pista visual de 5 titulares (1 por posición) con asignación/intercambio en memoria                           |
| `/players`         | Jugadores        | Buscador y filtros sobre muestra ficticia de 36 jugadores por liga                                           |
| `/market`          | Mercado          | Mayores subidas/bajadas y tabla de cotizaciones simuladas (sin motor económico)                              |
| `/transfers`       | Traspasos        | Constructor multi-jugador con validación visual v0.3 (`18` jugadores, 5 posiciones, `>= 50 %`) y pestañas    |
| `/rankings`        | Clasificación    | Tabla general por liga activa con racha de las últimas 5 jornadas                                            |
| `/matches`         | Match Center     | Partidos programados, resultados, box score comparativo y actuaciones individuales                           |
| `/profile`         | Perfil           | Identidad del mánager y resumen de ligas                                                                     |
| `/settings`        | Ajustes          | Interruptores de preferencias visuales (incluye modo de tablas compactas en vivo)                            |
| `/auth`            | Acceso (preview) | Maqueta visual de inicio de sesión y registro sin autenticación real                                         |

## Organización interna

```text
src/
├── routes/         # Rutas basadas en archivos (TanStack Router)
├── features/       # Vistas compuestas por dominio (dashboard, leagues, teams, lineup...)
├── components/
│   ├── ui/         # Primitivas accesibles (Card, Badge, Button, Input, Switch, ModalDialog)
│   ├── layout/     # AppShell (sidebar, drawer móvil, cabecera y selector de liga)
│   ├── shared/     # PageHeader, EmptyState, LoadingSkeletonCard, ErrorFallbackCard
│   └── <dominio>/  # Tablas, tarjetas de jugador, ligas, mercado, partidos, clasificación, traspasos
├── data/           # Datos de ejemplo ficticios organizados por liga (`mocks.ts`)
├── hooks/          # Estado local del prototipo (`use-dream5-state.ts` + `Dream5StateProvider`)
├── lib/            # Helpers (`cn`, formateadores y evaluación visual `evaluateTradeProposal`)
├── services/       # Reservado para futuros clientes HTTP y Socket.IO hacia `apps/api`
├── styles/         # Tema oscuro CSS-first de Tailwind v4 (`app.css`)
└── types/          # Tipos de dominio de UI (`fantasy.ts`) y `vite-env.d.ts`
```

## Pruebas

- **Unitarias (Vitest):** `src/lib/utils.test.ts` y `src/lib/trade-rules.test.ts`.
- **End-to-End (Playwright):** `e2e/smoke.spec.ts` verifica arranque SSR/CSR en producción, cambio de liga activa, navegación por rutas principales, menú móvil (`390px`) y ausencia de errores de consola.
