import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { SeasonSummaryDto } from '@dreamfive/shared';

import { AdminSimulationGuard, LeagueMemberGuard } from '../../common/auth.guards.js';
import { SeasonsService } from './seasons.service.js';

@ApiTags('seasons')
@ApiBearerAuth()
@Controller('leagues/:leagueId/seasons')
export class SeasonsController {
  constructor(private readonly seasonsService: SeasonsService) {}

  @Get()
  @UseGuards(LeagueMemberGuard)
  listSeasons(@Param('leagueId') leagueId: string): Promise<readonly SeasonSummaryDto[]> {
    return this.seasonsService.listSeasons(leagueId);
  }

  @Post('advance')
  @UseGuards(AdminSimulationGuard)
  advanceSeason(@Param('leagueId') leagueId: string) {
    return this.seasonsService.rollOverSeason(leagueId);
  }
}
