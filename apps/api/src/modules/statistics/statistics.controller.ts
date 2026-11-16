import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { LeagueMemberGuard } from '../../common/auth.guards.js';
import { StatisticsService } from './statistics.service.js';

@ApiTags('statistics')
@ApiBearerAuth()
@UseGuards(LeagueMemberGuard)
@Controller('leagues/:leagueId/statistics')
export class StatisticsController {
  constructor(private readonly statisticsService: StatisticsService) {}

  @Get()
  getStatistics(@Param('leagueId') leagueId: string) {
    return this.statisticsService.getLeagueStatistics(leagueId);
  }
}
