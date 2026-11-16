import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { LeagueMemberGuard } from '../../common/auth.guards.js';
import { MarketService } from './market.service.js';

@ApiTags('market')
@ApiBearerAuth()
@UseGuards(LeagueMemberGuard)
@Controller('leagues/:leagueId/market')
export class MarketController {
  constructor(private readonly marketService: MarketService) {}

  @Get()
  getMarket(@Param('leagueId') leagueId: string) {
    return this.marketService.getMarketOverview(leagueId);
  }
}
