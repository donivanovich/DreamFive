import { describe, expect, it } from 'vitest';

import { parseApiEnv } from './env.schema.js';

const validEnv = {
  NODE_ENV: 'development',
  API_CORS_ORIGINS: 'http://localhost:3000, https://app.example.com/',
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db?schema=public',
  REDIS_HOST: 'localhost',
};

describe('parseApiEnv', () => {
  it('aplica valores por defecto y normaliza los orígenes CORS', () => {
    const env = parseApiEnv(validEnv);
    expect(env.API_PORT).toBe(3001);
    expect(env.API_SWAGGER_ENABLED).toBe(false);
    expect(env.API_CORS_ORIGINS).toEqual(['http://localhost:3000', 'https://app.example.com']);
    expect(env.SMTP_HOST).toBe('smtp.gmail.com');
    expect(env.SMTP_PORT).toBe(465);
    expect(env.SMTP_SECURE).toBe(true);
  });

  it('rechaza comodines y orígenes con ruta en CORS', () => {
    expect(() => parseApiEnv({ ...validEnv, API_CORS_ORIGINS: '*' })).toThrow();
    expect(() =>
      parseApiEnv({ ...validEnv, API_CORS_ORIGINS: 'https://app.example.com/path' }),
    ).toThrow();
  });

  it('exige DATABASE_URL de PostgreSQL', () => {
    expect(() => parseApiEnv({ ...validEnv, DATABASE_URL: 'mysql://localhost/db' })).toThrow();
  });

  it('impide habilitar Swagger o omitir la contraseña de Redis en producción', () => {
    expect(() =>
      parseApiEnv({
        ...validEnv,
        NODE_ENV: 'production',
        API_SWAGGER_ENABLED: 'true',
        REDIS_PASSWORD: 'a-very-long-redis-password',
      }),
    ).toThrow(/API_SWAGGER_ENABLED/);
    expect(() =>
      parseApiEnv({
        ...validEnv,
        NODE_ENV: 'production',
        DEV_TOOLS_ENABLED: 'true',
        REDIS_PASSWORD: 'a-very-long-redis-password',
      }),
    ).toThrow(/DEV_TOOLS_ENABLED/);
    expect(() => parseApiEnv({ ...validEnv, NODE_ENV: 'production' })).toThrow(/REDIS_PASSWORD/);
  });

  it('no incluye valores de variables en el mensaje de error', () => {
    let message = '';
    try {
      parseApiEnv({ ...validEnv, DATABASE_URL: 'secret-value' });
    } catch (error) {
      message = error instanceof Error ? error.message : '';
    }
    expect(message).toContain('DATABASE_URL');
    expect(message).not.toContain('secret-value');
  });
});
