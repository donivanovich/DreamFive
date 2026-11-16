import helmet from '@fastify/helmet';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';

import type { ApiEnv } from './env.schema.js';

/**
 * Cabeceras de seguridad HTTP y política CORS.
 *
 * La API solo devuelve JSON, por lo que la CSP es muy restrictiva. Cuando
 * Swagger UI está habilitado (solo fuera de producción) se relaja lo mínimo
 * imprescindible para que la interfaz de documentación funcione.
 */
export async function applyHttpSecurity(app: NestFastifyApplication, env: ApiEnv): Promise<void> {
  const swaggerEnabled = isSwaggerEnabled(env);

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: swaggerEnabled
        ? {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:'],
            frameAncestors: ["'none'"],
          }
        : {
            defaultSrc: ["'none'"],
            frameAncestors: ["'none'"],
          },
    },
    crossOriginResourcePolicy: { policy: 'same-site' },
    hsts: env.NODE_ENV === 'production',
  });

  app.enableCors({
    origin: [...env.API_CORS_ORIGINS],
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id'],
    maxAge: 600,
  });
}

/** Swagger solo se expone si se habilita explícitamente y nunca en producción. */
export function isSwaggerEnabled(env: ApiEnv): boolean {
  return env.API_SWAGGER_ENABLED && env.NODE_ENV !== 'production';
}
