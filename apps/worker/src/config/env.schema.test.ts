import { describe, expect, it } from 'vitest';

import { parseWorkerEnv } from './env.schema.js';

const validWorkerEnv = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db?schema=public',
  REDIS_HOST: 'localhost',
};

describe('parseWorkerEnv', () => {
  it('aplica valores por defecto', () => {
    const env = parseWorkerEnv(validWorkerEnv);
    expect(env.REDIS_PORT).toBe(6379);
    expect(env.QUEUE_PREFIX).toBe('dreamfive');
    expect(env.WORKER_HEARTBEAT_INTERVAL_MS).toBe(10_000);
    expect(env.WORKER_SCHEDULER_INTERVAL_MS).toBe(30_000);
  });

  it('exige DATABASE_URL y REDIS_HOST', () => {
    expect(() => parseWorkerEnv({})).toThrow(/DATABASE_URL/);
    expect(() => parseWorkerEnv({ DATABASE_URL: validWorkerEnv.DATABASE_URL })).toThrow(
      /REDIS_HOST/,
    );
  });

  it('exige contraseña de Redis robusta en producción', () => {
    expect(() =>
      parseWorkerEnv({ ...validWorkerEnv, NODE_ENV: 'production', REDIS_HOST: 'redis' }),
    ).toThrow(/REDIS_PASSWORD/);
  });
});
