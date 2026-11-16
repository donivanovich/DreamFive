import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  type AuthUserDto,
  type CreateLeagueInput,
  createLeagueSchema,
  type LeagueSummaryDto,
} from '@dream5/shared';

import { CurrentUser, LeagueMemberGuard, SessionAuthGuard } from '../../common/auth.guards.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { type LeagueDetailDto, LeaguesService } from './leagues.service.js';

@ApiTags('leagues')
@ApiBearerAuth()
@UseGuards(SessionAuthGuard)
@Controller('leagues')
export class LeaguesController {
  constructor(private readonly leaguesService: LeaguesService) {}

  @Get()
  listMyLeagues(@CurrentUser() user: AuthUserDto): Promise<readonly LeagueSummaryDto[]> {
    return this.leaguesService.listUserLeagues(user.id);
  }

  @Post()
  createLeague(
    @CurrentUser() user: AuthUserDto,
    @Body(new ZodValidationPipe(createLeagueSchema)) body: CreateLeagueInput,
  ) {
    return this.leaguesService.createLeague(user.id, body);
  }

  @Get(':leagueId')
  @UseGuards(LeagueMemberGuard)
  getLeagueDetail(
    @Param('leagueId') leagueId: string,
    @CurrentUser() user: AuthUserDto,
  ): Promise<LeagueDetailDto> {
    return this.leaguesService.getLeagueDetail(leagueId, user.id);
  }
}
