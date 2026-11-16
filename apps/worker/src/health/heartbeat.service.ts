import { rm, writeFile } from 'node:fs/promises';

import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { Redis } from 'ioredis';

import type { WorkerEnv } from '../config/env.schema.js';
import { buildRedisConnectionOptions, WORKER_ENV } from '../config/worker-config.module.js';

/**
 * Latido del worker para el health check de Docker.
 *
 * Cada intervalo comprueba que Redis responde y, solo entonces, escribe la
 * marca de tiempo en WORKER_HEARTBEAT_FILE. `healthcheck.ts` considera el
 * worker sano si el archivo se actualizó recientemente.
 */
@Injectable()
export class HeartbeatService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(HeartbeatService.name);
  private readonly redis: Redis;
  private timer: NodeJS.Timeout | undefined;

  constructor(@Inject(WORKER_ENV) private readonly env: WorkerEnv) {
    this.redis = new Redis({
      ...buildRedisConnectionOptions(env),
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.beat();
    this.timer = setInterval(() => void this.beat(), this.env.WORKER_HEARTBEAT_INTERVAL_MS);
  }

  async onApplicationShutdown(): Promise<void> {
    clearInterval(this.timer);
    await rm(this.env.WORKER_HEARTBEAT_FILE, { force: true });
    if (this.redis.status !== 'end' && this.redis.status !== 'wait') {
      await this.redis.quit();
    }
  }

  private async beat(): Promise<void> {
    try {
      if (this.redis.status === 'wait') {
        await this.redis.connect();
      }
      await this.redis.ping();
      await writeFile(this.env.WORKER_HEARTBEAT_FILE, String(Date.now()), 'utf8');
    } catch (error) {
      this.logger.warn(
        `Latido omitido: Redis no disponible (${error instanceof Error ? error.message : 'error desconocido'})`,
      );
    }
  }
}
