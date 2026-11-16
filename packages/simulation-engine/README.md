# `@dream5/simulation-engine` — Motor de Simulación Deportiva

Paquete TypeScript puro e independiente que encapsulará toda la lógica matemática y deportiva de DREAM5.

## Responsabilidad

- Simulación de partidos jugada a jugada / posesión a posesión (`src/match/`).
- Generación de estadísticas individuales y colectivas (`src/statistics/`).
- Cálculo de puntuación fantasy a partir de estadísticas (`src/scoring/`).
- Modelo de lesiones y expulsiones (`src/injuries/`).
- Progresión y evolución de jugadores (`src/progression/`).
- Utilidades puras compartidas (`src/shared/`), como generadores pseudoaleatorios con semilla.

## Ajuste estructural documentado

En la referencia inicial se mostraban `match/`, `statistics/`, `scoring/`, `injuries/`, `progression/` y `shared/` directamente en la raíz del paquete. Se han ubicado bajo `src/` (`src/match/`, etc.) manteniendo `dist/` como salida compilada limpia, de forma coherente con `rootDir: "src"` en `tsconfig.build.json` y con los demás paquetes de `packages/`.

## Normas de aislamiento (obligatorias)

1. **Cero dependencias de framework:** prohibido importar NestJS, Fastify, React, Prisma, Redis o BullMQ.
2. **Sin APIs de Node.js:** `tsconfig.build.json` fija `"types": []` para impedir el uso accidental de `fs`, `process`, `crypto` de Node, etc. El motor debe ser portable.
3. **Determinismo:** toda aleatoriedad deberá recibirse como parámetro (semilla o PRNG inyectado) para que cualquier partido pueda reproducirse exactamente en pruebas y auditorías.
