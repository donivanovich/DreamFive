import { Injectable, NotFoundException } from '@nestjs/common';
import {
  LEAGUE_MAIL_CATEGORIES,
  type LeagueMailCategory,
  type LeagueMailDto,
  type LeagueMailListResponseDto,
  SOCKET_EVENTS,
} from '@dream5/shared';

import { PrismaService } from '../../database/prisma.service.js';
import { RealtimeService } from '../../realtime/realtime.service.js';

const VALID_CATEGORIES = new Set<string>(LEAGUE_MAIL_CATEGORIES);

@Injectable()
export class LeagueMailService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  async listTeamMails(
    leagueId: string,
    leagueTeamId: string,
    filters?: { readonly category?: string; readonly unreadOnly?: boolean },
  ): Promise<LeagueMailListResponseDto> {
    const category =
      filters?.category && VALID_CATEGORIES.has(filters.category)
        ? (filters.category as LeagueMailCategory)
        : undefined;

    const baseWhere = { leagueId, leagueTeamId };
    const [unreadCount, rows] = await Promise.all([
      this.prisma.client.leagueMail.count({
        where: { ...baseWhere, isRead: false },
      }),
      this.prisma.client.leagueMail.findMany({
        where: {
          ...baseWhere,
          ...(category ? { category } : {}),
          ...(filters?.unreadOnly ? { isRead: false } : {}),
        },
        orderBy: [{ createdAt: 'desc' }],
        take: 200,
      }),
    ]);

    const items: LeagueMailDto[] = rows.map((row) => ({
      id: row.id,
      leagueId: row.leagueId,
      seasonId: row.seasonId,
      leagueTeamId: row.leagueTeamId,
      roundNumber: row.roundNumber,
      category: row.category,
      subject: row.subject,
      body: row.body,
      metadata:
        row.metadataJson && typeof row.metadataJson === 'object' && !Array.isArray(row.metadataJson)
          ? (row.metadataJson as Record<string, unknown>)
          : null,
      isRead: row.isRead,
      createdAt: row.createdAt.toISOString(),
    }));

    return { unreadCount, items };
  }

  async markRead(
    leagueId: string,
    leagueTeamId: string,
    mailId: string,
  ): Promise<{ readonly id: string; readonly isRead: true }> {
    const updated = await this.prisma.client.leagueMail.updateMany({
      where: { id: mailId, leagueId, leagueTeamId },
      data: { isRead: true },
    });
    if (updated.count === 0) {
      throw new NotFoundException('Correo no encontrado para tu equipo en esta liga.');
    }

    this.realtime.emitLeagueEvent({
      leagueId,
      eventType: SOCKET_EVENTS.mailUpdated,
      timestamp: new Date().toISOString(),
    });

    return { id: mailId, isRead: true };
  }

  async markAllRead(
    leagueId: string,
    leagueTeamId: string,
  ): Promise<{ readonly updatedCount: number }> {
    const res = await this.prisma.client.leagueMail.updateMany({
      where: { leagueId, leagueTeamId, isRead: false },
      data: { isRead: true },
    });

    if (res.count > 0) {
      this.realtime.emitLeagueEvent({
        leagueId,
        eventType: SOCKET_EVENTS.mailUpdated,
        timestamp: new Date().toISOString(),
      });
    }

    return { updatedCount: res.count };
  }

  async deleteMail(
    leagueId: string,
    leagueTeamId: string,
    mailId: string,
  ): Promise<{ readonly deleted: true }> {
    const res = await this.prisma.client.leagueMail.deleteMany({
      where: { id: mailId, leagueId, leagueTeamId },
    });
    if (res.count === 0) {
      throw new NotFoundException('Correo no encontrado para tu equipo en esta liga.');
    }

    this.realtime.emitLeagueEvent({
      leagueId,
      eventType: SOCKET_EVENTS.mailUpdated,
      timestamp: new Date().toISOString(),
    });

    return { deleted: true };
  }
}
