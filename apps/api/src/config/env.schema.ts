import { z } from 'zod';

/**
 * Esquema de variables de entorno de la API.
 *
 * Se valida al arrancar: si falta una variable obligatoria o tiene un formato
 * incorrecto, la aplicación no se inicia (fail-fast).
 */

const booleanFromString = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true')
  .default(false);

/** Origen HTTP(S) sin ruta, consulta ni comodines (p. ej. https://app.example.com). */
const httpOrigin = z
  .url({ protocol: /^https?$/ })
  .refine((value) => new URL(value).origin === value.replace(/\/$/, ''), {
    message: 'Debe ser un origen (protocolo://host[:puerto]) sin ruta',
  })
  .transform((value) => value.replace(/\/$/, ''));

const corsOrigins = z
  .string()
  .min(1)
  .transform((value) =>
    value
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0),
  )
  .pipe(z.array(httpOrigin).min(1));

export const apiEnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

    API_HOST: z.string().min(1).default('0.0.0.0'),
    API_PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
    API_CORS_ORIGINS: corsOrigins,
    API_TRUST_PROXY: booleanFromString,
    API_SWAGGER_ENABLED: booleanFromString,
    AUTH_SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(720).default(168),
    AUTH_COOKIE_NAME: z
      .string()
      .regex(/^[a-zA-Z0-9_-]+$/)
      .default('dream5_session'),
    DEV_TOOLS_ENABLED: booleanFromString,
    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1_000).max(3_600_000).default(60_000),
    RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().min(5).max(10_000).default(120),

    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),

    REDIS_HOST: z.string().min(1),
    REDIS_PORT: z.coerce.number().int().min(1).max(65_535).default(6379),
    REDIS_PASSWORD: z.string().optional(),
    REDIS_DB: z.coerce.number().int().min(0).max(15).default(0),
    QUEUE_PREFIX: z
      .string()
      .regex(/^[a-z0-9-]+$/)
      .default('dream5'),
    WEB_PUBLIC_URL: z.url({ protocol: /^https?$/ }).default('http://localhost:3000'),
    SMTP_HOST: z.string().trim().min(1).default('smtp.gmail.com'),
    SMTP_PORT: z.coerce.number().int().min(1).max(65_535).default(465),
    SMTP_SECURE: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .default(true),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    SMTP_FROM: z.string().trim().min(3).default('DREAM5 <no-reply@dream5.local>'),
    UPLOAD_DIR: z.string().trim().min(1).default('uploads'),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') {
      return;
    }
    if (!env.REDIS_PASSWORD || env.REDIS_PASSWORD.length < 16) {
      ctx.addIssue({
        code: 'custom',
        path: ['REDIS_PASSWORD'],
        message: 'En producción REDIS_PASSWORD es obligatoria (mínimo 16 caracteres)',
      });
    }
    if (env.API_SWAGGER_ENABLED) {
      ctx.addIssue({
        code: 'custom',
        path: ['API_SWAGGER_ENABLED'],
        message: 'Swagger no puede habilitarse en producción',
      });
    }
    if (env.DEV_TOOLS_ENABLED) {
      ctx.addIssue({
        code: 'custom',
        path: ['DEV_TOOLS_ENABLED'],
        message: 'Las herramientas de desarrollo no pueden habilitarse en producción',
      });
    }
  });

export type ApiEnv = z.infer<typeof apiEnvSchema>;

/**
 * Valida un objeto de entorno y devuelve la configuración tipada.
 * Lanza un error legible (sin valores de las variables) si no es válido.
 */
export function parseApiEnv(source: Record<string, string | undefined>): ApiEnv {
  const result = apiEnvSchema.safeParse(source);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Configuración de entorno inválida:\n${details}`);
  }
  return result.data;
}
