import { Inject, Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  type OnGatewayConnection,
  type OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { SOCKET_EVENTS } from '@dreamfive/shared';
import type { Server, Socket } from 'socket.io';

import { parseCookieHeader } from '../common/http-cookies.js';
import { API_ENV } from '../config/app-config.module.js';
import type { ApiEnv } from '../config/env.schema.js';
import { PrismaService } from '../database/prisma.service.js';
import { AuthService } from '../modules/auth/auth.service.js';
import { buildLeagueRoomName, RealtimeService } from './realtime.service.js';

interface SocketClientData {
  userId?: string;
}

interface RoomMembershipPayload {
  readonly leagueId?: string;
}

@WebSocketGateway()
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    @Inject(API_ENV) private readonly env: ApiEnv,
    private readonly authService: AuthService,
    private readonly prisma: PrismaService,
    private readonly realtimeService: RealtimeService,
  ) {}

  afterInit(server: Server): void {
    this.realtimeService.attachServer(server);
  }

  async handleConnection(client: Socket): Promise<void> {
    const handshakeAuth = client.handshake.auth as Record<string, unknown> | undefined;
    const authToken =
      typeof handshakeAuth?.['token'] === 'string' ? handshakeAuth['token'] : undefined;
    const cookies = parseCookieHeader(client.handshake.headers.cookie);
    const token = authToken ?? cookies[this.env.AUTH_COOKIE_NAME];

    if (!token) {
      client.disconnect(true);
      return;
    }

    const user = await this.authService.resolveSessionUser(token);
    if (!user) {
      client.disconnect(true);
      return;
    }

    (client.data as SocketClientData).userId = user.id;
  }

  @SubscribeMessage(SOCKET_EVENTS.joinLeagueRoom)
  async handleJoinLeagueRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: RoomMembershipPayload,
  ): Promise<{ readonly joined: boolean; readonly leagueId?: string }> {
    const userId = (client.data as SocketClientData).userId;
    const leagueId = payload.leagueId;
    if (!userId || !leagueId) {
      return { joined: false };
    }

    const membership = await this.prisma.client.leagueMember.findUnique({
      where: {
        leagueId_userId: { leagueId, userId },
      },
      select: { id: true },
    });

    if (!membership) {
      this.logger.warn(`Intento no autorizado de unirse a sala ${leagueId} por usuario ${userId}`);
      return { joined: false };
    }

    await client.join(buildLeagueRoomName(leagueId));
    return { joined: true, leagueId };
  }

  @SubscribeMessage(SOCKET_EVENTS.leaveLeagueRoom)
  async handleLeaveLeagueRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: RoomMembershipPayload,
  ): Promise<{ readonly left: boolean }> {
    if (payload.leagueId) {
      await client.leave(buildLeagueRoomName(payload.leagueId));
    }
    return { left: true };
  }
}
