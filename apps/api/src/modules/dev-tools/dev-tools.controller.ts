import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { type AdvanceGameClockInput, advanceGameClockSchema } from '@dream5/shared';
import { z } from 'zod';

import {
  AdminSimulationGuard,
  CurrentMembership,
  LeagueMemberGuard,
  type LeagueMembershipContext,
} from '../../common/auth.guards.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { DevToolsService } from './dev-tools.service.js';

const simulateRoundBodySchema = z.object({
  roundNumber: z.number().int().min(1).max(58).optional(),
});

const simulateMatchBodySchema = z.object({
  matchId: z.string().min(1).optional(),
});

@ApiTags('dev-tools')
@ApiBearerAuth()
@UseGuards(AdminSimulationGuard, LeagueMemberGuard)
@Controller('dev/leagues/:leagueId')
export class DevToolsController {
  constructor(private readonly devToolsService: DevToolsService) {}

  @Get('status')
  getStatus(@Param('leagueId') leagueId: string) {
    return this.devToolsService.getLeagueStatus(leagueId);
  }

  @Post('simulate-round')
  simulateRound(
    @Param('leagueId') leagueId: string,
    @Body(new ZodValidationPipe(simulateRoundBodySchema))
    body: { readonly roundNumber?: number } = {},
  ) {
    return this.devToolsService.simulateRound(leagueId, body.roundNumber);
  }

  @Post('simulate-match')
  simulateMatch(
    @Param('leagueId') leagueId: string,
    @CurrentMembership() membership: LeagueMembershipContext,
    @Body(new ZodValidationPipe(simulateMatchBodySchema)) body: { readonly matchId?: string } = {},
  ) {
    return this.devToolsService.simulateSingleMatch(
      leagueId,
      membership.leagueTeamId,
      body.matchId,
    );
  }

  @Post('advance-clock')
  advanceClock(
    @Param('leagueId') leagueId: string,
    @Body(new ZodValidationPipe(advanceGameClockSchema)) body: AdvanceGameClockInput,
  ) {
    return this.devToolsService.advanceClockAndSimulate(leagueId, body);
  }

  @Post('reprice-market')
  repriceMarket(@Param('leagueId') leagueId: string) {
    return this.devToolsService.repriceMarket(leagueId);
  }

  @Post('finish-season')
  finishSeason(
    @Param('leagueId') leagueId: string,
    @Body(new ZodValidationPipe(z.object({ simulateRemainingRounds: z.boolean().optional() })))
    body: { readonly simulateRemainingRounds?: boolean } = {},
  ) {
    return this.devToolsService.finishSeasonRollover(
      leagueId,
      body.simulateRemainingRounds ?? false,
    );
  }

  @Post('sync-clock')
  syncClock(@Param('leagueId') leagueId: string) {
    return this.devToolsService.syncClockToRealTime(leagueId);
  }
}
