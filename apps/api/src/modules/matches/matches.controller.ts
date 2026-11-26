import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { MatchDetailDto, MatchStatus } from '@dreamfive/shared';

import { LeagueMemberGuard } from '../../common/auth.guards.js';
import { MatchesService } from './matches.service.js';

@ApiTags('matches')
@ApiBearerAuth()
@UseGuards(LeagueMemberGuard)
@Controller('leagues/:leagueId/matches')
export class MatchesController {
  constructor(private readonly matchesService: MatchesService) {}

  @Get()
  listMatches(
    @Param('leagueId') leagueId: string,
    @Query('roundNumber') roundRaw?: string,
    @Query('teamId') teamId?: string,
    @Query('status') status?: MatchStatus,
    @Query('seasonId') seasonId?: string,
  ) {
    const roundNumber = roundRaw ? Number(roundRaw) : undefined;
    return this.matchesService.listMatches(leagueId, {
      ...(roundNumber !== undefined && Number.isFinite(roundNumber) ? { roundNumber } : {}),
      ...(teamId ? { teamId } : {}),
      ...(status ? { status } : {}),
      ...(seasonId ? { seasonId } : {}),
    });
  }

  @Get(':matchId')
  getMatchDetail(
    @Param('leagueId') leagueId: string,
    @Param('matchId') matchId: string,
  ): Promise<MatchDetailDto> {
    return this.matchesService.getMatchDetail(leagueId, matchId);
  }
}
