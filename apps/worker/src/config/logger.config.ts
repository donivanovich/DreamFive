import { createRequire } from 'node:module';

import type { Params } from 'nestjs-pino';

import type { WorkerEnv } from './env.schema.js';

function isPinoPrettyAvailable(): boolean {
  try {
    createRequire(import.meta.url).resolve('pino-pretty');
    return true;
  } catch {
    return false;
  }
}

/** Logging estructurado del worker: JSON si no hay `pino-pretty`, legible en desarrollo local. */
export function buildLoggerParams(env: WorkerEnv): Params {
  return {
    pinoHttp: {
      level: env.LOG_LEVEL,
      base: { service: 'worker' },
      ...(env.NODE_ENV === 'development' && isPinoPrettyAvailable()
        ? { transport: { target: 'pino-pretty', options: { singleLine: true } } }
        : {}),
    },
  };
}
