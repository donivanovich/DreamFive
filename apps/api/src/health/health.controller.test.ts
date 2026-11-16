import { ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';

import { PrismaService } from '../database/prisma.service.js';
import { REDIS_CLIENT } from '../redis/redis.module.js';
import { HealthController } from './health.controller.js';

async function createController(options: { dbUp: boolean; redisUp: boolean }) {
  const moduleRef = await Test.createTestingModule({
    controllers: [HealthController],
    providers: [
      {
        provide: PrismaService,
        useValue: {
          ping: vi.fn(() => (options.dbUp ? Promise.resolve() : Promise.reject(new Error('db')))),
        },
      },
      {
        provide: REDIS_CLIENT,
        useValue: {
          status: 'ready',
          ping: vi.fn(() =>
            options.redisUp ? Promise.resolve('PONG') : Promise.reject(new Error('redis')),
          ),
        },
      },
    ],
  }).compile();
  return moduleRef.get(HealthController);
}

describe('HealthController', () => {
  it('liveness responde ok', async () => {
    const controller = await createController({ dbUp: true, redisUp: true });
    expect(controller.liveness()).toEqual({ status: 'ok' });
  });

  it('readiness responde ok si PostgreSQL y Redis están disponibles', async () => {
    const controller = await createController({ dbUp: true, redisUp: true });
    await expect(controller.readiness()).resolves.toEqual({
      status: 'ok',
      checks: { database: 'up', redis: 'up' },
    });
  });

  it('readiness responde 503 si alguna dependencia falla', async () => {
    const controller = await createController({ dbUp: false, redisUp: true });
    await expect(controller.readiness()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
