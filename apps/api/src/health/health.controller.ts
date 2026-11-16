import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Redis } from 'ioredis';

import { PrismaService } from '../database/prisma.service.js';
import { REDIS_CLIENT } from '../redis/redis.module.js';

type DependencyStatus = 'up' | 'down';

export interface ReadinessReport {
  readonly status: 'ok' | 'error';
  readonly checks: { readonly database: DependencyStatus; readonly redis: DependencyStatus };
}

/**
 * Endpoints técnicos de salud (no forman parte del dominio del juego).
 *
 * - `GET /health`: liveness. El proceso responde.
 * - `GET /health/ready`: readiness. PostgreSQL y Redis son accesibles.
 */
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  liveness(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  @HttpCode(HttpStatus.OK)
  async readiness(): Promise<ReadinessReport> {
    const [database, redis] = await Promise.all([
      this.check(() => this.prisma.ping()),
      this.check(async () => {
        if (this.redis.status === 'wait') {
          await this.redis.connect();
        }
        await this.redis.ping();
      }),
    ]);

    const report: ReadinessReport = {
      status: database === 'up' && redis === 'up' ? 'ok' : 'error',
      checks: { database, redis },
    };
    if (report.status === 'error') {
      throw new ServiceUnavailableException(report);
    }
    return report;
  }

  private async check(probe: () => Promise<void>): Promise<DependencyStatus> {
    try {
      await probe();
      return 'up';
    } catch {
      return 'down';
    }
  }
}
