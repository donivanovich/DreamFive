# Auditoría de dependencias y seguridad de paquetes

Fecha de comprobación: 13 de noviembre de 2026 (`pnpm@12.18.0`, Node.js `v24.14.0`).

## Resumen ejecutivo

Se ejecutaron `pnpm audit` (completo) y `pnpm audit --prod` sobre el `pnpm-lock.yaml` generado tras una instalación limpia sin `--force` ni `--legacy-peer-deps`.

| Ámbito                                                         | Críticas | Altas | Moderadas | Bajas | Informativas |
| -------------------------------------------------------------- | :------: | :---: | :-------: | :---: | :----------: |
| Workspace completo (`pnpm audit`, 618 paquetes)                |    0     |   0   |     1     |   0   |      0       |
| Dependencias de producción (`pnpm audit --prod`, 420 paquetes) |    0     |   0   |     1     |   0   |      0       |

> **Nota sobre `pnpm audit --prod`:** el único aviso presente aparece también en `--prod` porque `@dream5/config` declara las herramientas de ESLint bajo `dependencies` para poder exportar su configuración compartida. Sin embargo, `@dream5/config` solo se referencia en `devDependencies` del paquete raíz y de las aplicaciones, por lo que **no se incluye** en las imágenes Docker de producción generadas con `pnpm deploy --prod`.

## Vulnerabilidad detectada

### `GHSA-g3hv-75wg-m249` — `minimatch` (severidad: moderada)

- **Paquete afectado:** `minimatch@10.2.6` (vulnerable en `>=7.0.0 <11.0.1`, corregido en `>=11.0.1`).
- **Tipo:** potencial denegación de servicio (DoS) por amplificación de _globs_ (CWE-405).
- **Cadena de dependencias que la introduce:**
  - `eslint@10.14.0` → `minimatch@^10.2.6` y `@eslint/config-array@0.23.5` → `minimatch@^10.2.4`
  - `typescript-eslint@8.72.2` → `@typescript-eslint/typescript-estree@8.72.2` → `minimatch@^10.2.2`
- **Comprobación de actualización compatible:**
  - `eslint@10.14.0`, `@eslint/config-array@0.23.5` y `typescript-eslint@8.72.2` son las últimas versiones estables publicadas.
  - `minimatch@11.0.1+` supone un salto de versión mayor (_breaking change_ potencial en la API interna de ESLint).
  - No se ha introducido un `overrides` forzado para no romper compatibilidad entre versiones mayores sin soporte oficial de ESLint.
- **Evaluación de riesgo:**
  - **Riesgo en tiempo de ejecución (producción):** nulo; ni `eslint` ni `minimatch` se ejecutan ni se empaquetan en `api`, `worker` o `web`.
  - **Riesgo en desarrollo/CI:** bajo; `minimatch` solo evalúa patrones estáticos definidos en `eslint.config.js` sobre rutas del propio repositorio.
- **Acción recomendada:** actualizar `eslint` y `typescript-eslint` en cuanto publiquen soporte oficial para `minimatch@^11.0.1`.

## Advertencias y decisiones de compatibilidad

1. **`node-abort-controller@3.1.1` (paquete obsoleto):**
   - Subdependencia transitiva de `bullmq@6.7.5`.
   - No presenta vulnerabilidades conocidas en la auditoría actual; se mantiene porque forma parte de las dependencias declaradas de la última versión estable de BullMQ.
2. **Eliminación de `@nestjs/cli`:**
   - `@nestjs/cli@12.0.12` depende de `@angular-devkit/schematics@22.2.6`, que exige `node >= 24.15.0` (incompatible con Node `24.14.0` del entorno local) y arrastraba dependencias duplicadas de TypeScript (`6.0.2` frente a `6.0.3` del catálogo).
   - Se sustituyó por compilación directa con `tsc -p tsconfig.build.json` y desarrollo con `concurrently` + `node --watch`, eliminando ~80 paquetes transitivos innecesarios.
3. **Scripts de instalación bloqueados (`allowBuilds`):**
   - `@scarf/scarf@1.4.0` (telemetría) y `msgpackr-extract@3.0.7` (compilación nativa opcional para `msgpackr`) quedaron bloqueados explícitamente (`false`) en `pnpm-workspace.yaml`.
   - Solo `@prisma/engines`, `@swc/core`, `esbuild` y `prisma` tienen permitido ejecutar scripts de instalación.
