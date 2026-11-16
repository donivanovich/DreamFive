import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Carga el `.env` de la raíz del monorepo en desarrollo local.
 *
 * - Nunca sobrescribe variables ya definidas en el entorno.
 * - Funciona tanto si se ejecuta desde `apps/api` como desde la raíz.
 * - En contenedores no existe `.env` y las variables llegan por Docker Compose.
 */
export function loadLocalEnvFile(): void {
  const candidates = [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      process.loadEnvFile(candidate);
      return;
    }
  }
}
