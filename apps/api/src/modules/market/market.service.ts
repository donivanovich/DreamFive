import { Injectable, NotFoundException } from '@nestjs/common';

import { toPlayerInstanceDto } from '../../common/dto-mappers.js';
import { PrismaService } from '../../database/prisma.service.js';

@Injectable()
export class MarketService {
  constructor(private readonly prisma: PrismaService) {}

  async getMarketOverview(leagueId: string) {
    const league = await this.prisma.client.league.findUnique({ where: { id: leagueId } });
    if (!league) {
      throw new NotFoundException('Liga no encontrada.');
    }

    const [gainers, fallers, mostValuable, history] = await Promise.all([
      this.prisma.client.playerInstance.findMany({
        where: { leagueId, isRetired: false },
        include: { currentTeam: { select: { name: true, code: true } } },
        orderBy: [{ priceDeltaMillions: 'desc' }, { priceMillions: 'desc' }],
        take: 12,
      }),
      this.prisma.client.playerInstance.findMany({
        where: { leagueId, isRetired: false },
        include: { currentTeam: { select: { name: true, code: true } } },
        orderBy: [{ priceDeltaMillions: 'asc' }, { priceMillions: 'desc' }],
        take: 12,
      }),
      this.prisma.client.playerInstance.findMany({
        where: { leagueId, isRetired: false },
        include: { currentTeam: { select: { name: true, code: true } } },
        orderBy: [{ priceMillions: 'desc' }, { overallRating: 'desc' }],
        take: 25,
      }),
      this.prisma.client.marketHistory.findMany({
        where: { leagueId },
        include: {
          player: {
            select: {
              id: true,
              name: true,
              position: true,
              currentTeam: { select: { code: true } },
            },
          },
        },
        orderBy: { recordedAt: 'desc' },
        take: 30,
      }),
    ]);

    return {
      marketMode: league.marketMode,
      gainers: gainers.map(toPlayerInstanceDto),
      fallers: fallers.map(toPlayerInstanceDto),
      mostValuable: mostValuable.map(toPlayerInstanceDto),
      recentMovements: history.map((h) => ({
        id: h.id,
        playerId: h.player.id,
        playerName: h.player.name,
        position: h.player.position,
        teamCode: h.player.currentTeam.code,
        priceMillions: h.priceMillions,
        deltaMillions: h.deltaMillions,
        reason: h.reason,
        recordedAt: h.recordedAt.toISOString(),
      })),
    };
  }
}
