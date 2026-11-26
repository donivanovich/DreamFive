import { Body, Controller, Get, Param, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { type LineupDto, type UpdateLineupInput, updateLineupSchema } from '@dreamfive/shared';

import {
  CurrentMembership,
  LeagueMemberGuard,
  type LeagueMembershipContext,
} from '../../common/auth.guards.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { LineupsService } from './lineups.service.js';

@ApiTags('lineups')
@ApiBearerAuth()
@UseGuards(LeagueMemberGuard)
@Controller('leagues/:leagueId/lineup')
export class LineupsController {
  constructor(private readonly lineupsService: LineupsService) {}

  @Get()
  getMyLineup(
    @Param('leagueId') leagueId: string,
    @CurrentMembership() membership: LeagueMembershipContext,
    @Query('roundNumber') roundRaw?: string,
  ): Promise<LineupDto> {
    const parsed = roundRaw ? Number(roundRaw) : undefined;
    return this.lineupsService.getTeamLineup(
      leagueId,
      membership.leagueTeamId,
      parsed !== undefined && Number.isFinite(parsed) ? parsed : undefined,
    );
  }

  @Put()
  saveMyLineup(
    @Param('leagueId') leagueId: string,
    @CurrentMembership() membership: LeagueMembershipContext,
    @Body(new ZodValidationPipe(updateLineupSchema)) body: UpdateLineupInput,
    @Query('roundNumber') roundRaw?: string,
  ): Promise<LineupDto> {
    const parsed = roundRaw ? Number(roundRaw) : undefined;
    return this.lineupsService.saveTeamLineup(
      leagueId,
      membership.leagueTeamId,
      body,
      parsed !== undefined && Number.isFinite(parsed) ? parsed : undefined,
    );
  }
}
