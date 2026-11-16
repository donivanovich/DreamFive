import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { createRequire } from 'node:module';

import type { Params } from 'nestjs-pino';

import type { ApiEnv } from './env.schema.js';

const REQUEST_ID_PATTERN = /^[a-zA-Z0-9-]{8,64}$/;

function isPinoPrettyAvailable(): boolean {
  try {
    createRequire(import.meta.url).resolve('pino-pretty');
    return true;
  } catch {
    return false;
  }
}

/**
 * Configuración del logging estructurado (pino) de la API.
 *
 * - JSON en producción (o en contenedores `--prod` sin devDependencies).
 * - Formato legible con pino-pretty solo en desarrollo cuando está disponible.
 * - Cabeceras sensibles redactadas.
 * - Identificador de petición propagado mediante `x-request-id`.
 */
export function buildLoggerParams(env: ApiEnv): Params {
  return {
    pinoHttp: {
      level: env.LOG_LEVEL,
      ...(env.NODE_ENV === 'development' && isPinoPrettyAvailable()
        ? { transport: { target: 'pino-pretty', options: { singleLine: true } } }
        : {}),
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.headers["set-cookie"]',
          'res.headers["set-cookie"]',
        ],
        censor: '[REDACTED]',
      },
      genReqId: (req: IncomingMessage) => {
        const header = req.headers['x-request-id'];
        return typeof header === 'string' && REQUEST_ID_PATTERN.test(header)
          ? header
          : randomUUID();
      },
      autoLogging: {
        ignore: (req: IncomingMessage) => req.url?.startsWith('/health') ?? false,
      },
    },
  };
}
