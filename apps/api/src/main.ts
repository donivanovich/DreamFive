import 'reflect-metadata';

import fastifyMultipart from '@fastify/multipart';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module.js';
import { parseApiEnv } from './config/env.schema.js';
import { applyHttpSecurity, isSwaggerEnabled } from './config/http-security.js';
import { loadLocalEnvFile } from './config/load-env.js';
import { setupSwagger, SWAGGER_PATH } from './config/swagger.js';
import { SecureIoAdapter } from './realtime/secure-io.adapter.js';

/**
 * Punto de entrada de la API de DreamFive.
 *
 * Solo arranca la infraestructura (HTTP, seguridad, logging, Socket.IO,
 * colas y salud). No registra endpoints de negocio.
 */
async function bootstrap(): Promise<void> {
  loadLocalEnvFile();
  const env = parseApiEnv(process.env);

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.forRoot(env),
    new FastifyAdapter({
      trustProxy: env.API_TRUST_PROXY,
      bodyLimit: 1_048_576,
    }),
    { bufferLogs: true },
  );

  await app.register(fastifyMultipart, {
    limits: {
      fileSize: 5 * 1024 * 1024,
      files: 1,
    },
  });

  const logger = app.get(Logger);
  app.useLogger(logger);
  app.enableShutdownHooks();

  await applyHttpSecurity(app, env);
  app.useWebSocketAdapter(new SecureIoAdapter(app, env.API_CORS_ORIGINS));

  if (isSwaggerEnabled(env)) {
    setupSwagger(app);
    logger.log(`Swagger disponible en /${SWAGGER_PATH}`, 'Bootstrap');
  }

  await app.listen({ host: env.API_HOST, port: env.API_PORT });
  logger.log(`API escuchando en ${env.API_HOST}:${String(env.API_PORT)}`, 'Bootstrap');
}

bootstrap().catch((error: unknown) => {
  // El logger de Nest puede no existir todavía (p. ej. entorno inválido).
  process.stderr.write(
    `[api] Error fatal durante el arranque: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
});
