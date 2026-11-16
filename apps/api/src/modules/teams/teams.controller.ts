import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import {
  CurrentMembership,
  LeagueMemberGuard,
  type LeagueMembershipContext,
} from '../../common/auth.guards.js';
import {
  type LeagueTeamDetailDto,
  type LeagueTeamSummaryDto,
  TeamsService,
} from './teams.service.js';

@ApiTags('teams')
@ApiBearerAuth()
@UseGuards(LeagueMemberGuard)
@Controller('leagues/:leagueId/teams')
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Get()
  listTeams(
    @Param('leagueId') leagueId: string,
    @CurrentMembership() membership: LeagueMembershipContext,
  ): Promise<readonly LeagueTeamSummaryDto[]> {
    return this.teamsService.listLeagueTeams(leagueId, membership.leagueTeamId);
  }

  @Get(':teamId')
  getTeamDetail(
    @Param('leagueId') leagueId: string,
    @Param('teamId') teamId: string,
    @CurrentMembership() membership: LeagueMembershipContext,
  ): Promise<LeagueTeamDetailDto> {
    return this.teamsService.getTeamDetail(leagueId, teamId, membership.leagueTeamId);
  }
}
