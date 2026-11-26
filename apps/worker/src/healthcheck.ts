import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Health check del contenedor del worker (`node dist/healthcheck.js`).
 *
 * Sale con código 0 si el latido es reciente y con 1 en caso contrario. No
 * arranca NestJS ni abre conexiones, para ser rápido y barato.
 */
const file = process.env['WORKER_HEARTBEAT_FILE'] ?? join(tmpdir(), 'dreamfive-worker.heartbeat');
const intervalMs = Number(process.env['WORKER_HEARTBEAT_INTERVAL_MS'] ?? 10_000);
const maxAgeMs = intervalMs * 3;

try {
  const lastBeat = Number(await readFile(file, 'utf8'));
  process.exit(Number.isFinite(lastBeat) && Date.now() - lastBeat <= maxAgeMs ? 0 : 1);
} catch {
  process.exit(1);
}
