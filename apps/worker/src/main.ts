import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';

import { parseWorkerEnv } from './config/env.schema.js';
import { loadLocalEnvFile } from './config/load-env.js';
import { WorkerModule } from './worker.module.js';

/**
 * Punto de entrada del worker de DreamFive.
 *
 * Proceso independiente de la API: puede iniciarse, detenerse y escalarse
 * por separado. Gestiona SIGTERM/SIGINT para cerrar las conexiones de BullMQ
 * de forma ordenada (los trabajos en curso terminan antes de salir).
 */
async function bootstrap(): Promise<void> {
  loadLocalEnvFile();
  const env = parseWorkerEnv(process.env);

  const app = await NestFactory.createApplicationContext(WorkerModule.forRoot(env), {
    bufferLogs: true,
  });
  const logger = app.get(Logger);
  app.useLogger(logger);
  app.enableShutdownHooks();
  await app.init();

  logger.log('Worker 24/7 de DreamFive iniciado con processors BullMQ activos', 'Bootstrap');
}

bootstrap().catch((error: unknown) => {
  process.stderr.write(
    `[worker] Error fatal durante el arranque: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
});
