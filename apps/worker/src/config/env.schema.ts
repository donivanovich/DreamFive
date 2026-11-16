import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { z } from 'zod';

/**
 * Esquema de variables de entorno del worker. Se valida al arrancar.
 */
export const workerEnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

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

    WORKER_HEARTBEAT_FILE: z.string().min(1).default(join(tmpdir(), 'dream5-worker.heartbeat')),
    WORKER_HEARTBEAT_INTERVAL_MS: z.coerce.number().int().min(1_000).max(60_000).default(10_000),
    WORKER_SCHEDULER_INTERVAL_MS: z.coerce.number().int().min(2_000).max(3_600_000).default(30_000),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && (!env.REDIS_PASSWORD || env.REDIS_PASSWORD.length < 16)) {
      ctx.addIssue({
        code: 'custom',
        path: ['REDIS_PASSWORD'],
        message: 'En producción REDIS_PASSWORD es obligatoria (mínimo 16 caracteres)',
      });
    }
  });

export type WorkerEnv = z.infer<typeof workerEnvSchema>;

export function parseWorkerEnv(source: Record<string, string | undefined>): WorkerEnv {
  const result = workerEnvSchema.safeParse(source);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Configuración de entorno inválida:\n${details}`);
  }
  return result.data;
}
