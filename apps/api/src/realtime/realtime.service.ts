import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { REDIS_CHANNELS, type RealtimeLeagueEventPayload } from '@dream5/shared';
import { Redis } from 'ioredis';
import type { Server } from 'socket.io';

import { API_ENV } from '../config/app-config.module.js';
import type { ApiEnv } from '../config/env.schema.js';
import { buildRedisConnectionOptions } from '../redis/redis.module.js';

export function buildLeagueRoomName(leagueId: string): string {
  return `league:${leagueId}`;
}

@Injectable()
export class RealtimeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RealtimeService.name);
  private server: Server | null = null;
  private subscriber: Redis | null = null;

  constructor(@Inject(API_ENV) private readonly env: ApiEnv) {}

  attachServer(server: Server): void {
    this.server = server;
  }

  emitLeagueEvent(payload: RealtimeLeagueEventPayload): void {
    if (!this.server) {
      return;
    }
    this.server.to(buildLeagueRoomName(payload.leagueId)).emit(payload.eventType, payload);
  }

  async onModuleInit(): Promise<void> {
    this.subscriber = new Redis({
      ...buildRedisConnectionOptions(this.env),
      lazyConnect: true,
      maxRetriesPerRequest: null,
    });

    this.subscriber.on('ready', () => {
      if (!this.subscriber) {
        return;
      }
      void this.subscriber
        .subscribe(REDIS_CHANNELS.leagueRealtimeEvents)
        .catch((error: unknown) => {
          this.logger.warn(
            `No se pudo suscribir al canal Redis Pub/Sub: ${error instanceof Error ? error.message : String(error)}`,
          );
        });
    });

    this.subscriber.on('message', (channel: string, rawMessage: string) => {
      if (channel !== REDIS_CHANNELS.leagueRealtimeEvents) {
        return;
      }
      try {
        const parsed = JSON.parse(rawMessage) as RealtimeLeagueEventPayload;
        if (parsed.leagueId && parsed.eventType) {
          this.emitLeagueEvent(parsed);
        }
      } catch (error: unknown) {
        this.logger.warn(
          `Mensaje Pub/Sub malformado: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    });

    try {
      await this.subscriber.connect();
    } catch (error: unknown) {
      this.logger.warn(
        `Suscriptor Redis Pub/Sub no conectado inicialmente: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.subscriber && this.subscriber.status !== 'end') {
      await this.subscriber.quit();
    }
  }
}
