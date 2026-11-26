import { Controller, Get } from '@nestjs/common';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { parseApiEnv } from './env.schema.js';
import { applyHttpSecurity, resolveAllowedCorsOrigins } from './http-security.js';

@Controller('cors-probe')
class CorsProbeController {
  @Get()
  probe() {
    return { ok: true };
  }
}

describe('resolveAllowedCorsOrigins & applyHttpSecurity', () => {
  it('expande localhost y 127.0.0.1 conservando puerto y protocolo sin tocar otros dominios', () => {
    expect(
      resolveAllowedCorsOrigins([
        'http://localhost:3100',
        'http://127.0.0.1:3000',
        'https://app.dream5.example',
      ]),
    ).toEqual([
      'http://localhost:3100',
      'http://127.0.0.1:3100',
      'http://127.0.0.1:3000',
      'http://localhost:3000',
      'https://app.dream5.example',
    ]);
  });

  it('permite CORS con credenciales entre 127.0.0.1 y localhost en el puerto configurado y bloquea orígenes externos', async () => {
    const env = parseApiEnv({
      NODE_ENV: 'development',
      API_CORS_ORIGINS: 'http://localhost:3100',
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/db?schema=public',
      REDIS_HOST: 'localhost',
    });

    const moduleRef = await Test.createTestingModule({
      controllers: [CorsProbeController],
    }).compile();

    const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await applyHttpSecurity(app, env);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    try {
      const loopbackIpRes = await app.inject({
        method: 'GET',
        url: '/cors-probe',
        headers: { origin: 'http://127.0.0.1:3100' },
      });
      expect(loopbackIpRes.statusCode).toBe(200);
      expect(loopbackIpRes.headers['access-control-allow-origin']).toBe('http://127.0.0.1:3100');
      expect(loopbackIpRes.headers['access-control-allow-credentials']).toBe('true');

      const externalRes = await app.inject({
        method: 'GET',
        url: '/cors-probe',
        headers: { origin: 'https://evil.example.com' },
      });
      expect(externalRes.headers['access-control-allow-origin']).toBeUndefined();
    } finally {
      await app.close();
    }
  });
});
