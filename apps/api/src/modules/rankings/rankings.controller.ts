import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import {
  CurrentMembership,
  LeagueMemberGuard,
  type LeagueMembershipContext,
} from '../../common/auth.guards.js';
import { RankingsService } from './rankings.service.js';

@ApiTags('rankings')
@ApiBearerAuth()
@UseGuards(LeagueMemberGuard)
@Controller('leagues/:leagueId/rankings')
export class RankingsController {
  constructor(private readonly rankingsService: RankingsService) {}

  @Get()
  getRankings(
    @Param('leagueId') leagueId: string,
    @CurrentMembership() membership: LeagueMembershipContext,
  ) {
    return this.rankingsService.getRankings(leagueId, membership.leagueTeamId);
  }
}
