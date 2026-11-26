import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AvailabilityStatus, PlayerRole, Position } from '@dreamfive/shared';

import { LeagueMemberGuard } from '../../common/auth.guards.js';
import { PlayersService } from './players.service.js';

@ApiTags('players')
@ApiBearerAuth()
@UseGuards(LeagueMemberGuard)
@Controller('leagues/:leagueId/players')
export class PlayersController {
  constructor(private readonly playersService: PlayersService) {}

  @Get()
  listPlayers(
    @Param('leagueId') leagueId: string,
    @Query('search') search?: string,
    @Query('position') position?: Position,
    @Query('role') role?: PlayerRole,
    @Query('status') status?: AvailabilityStatus,
    @Query('teamId') teamId?: string,
    @Query('sortBy')
    sortBy?:
      | 'name'
      | 'position'
      | 'role'
      | 'status'
      | 'pts'
      | 'reb'
      | 'ast'
      | 'fp'
      | 'price'
      | 'delta'
      | 'overall',
    @Query('sortDir') sortDir?: 'asc' | 'desc',
    @Query('limit') limitRaw?: string,
    @Query('offset') offsetRaw?: string,
  ) {
    const limit = limitRaw ? Number(limitRaw) : undefined;
    const offset = offsetRaw ? Number(offsetRaw) : undefined;

    return this.playersService.listPlayers(leagueId, {
      ...(search ? { search } : {}),
      ...(position ? { position } : {}),
      ...(role ? { role } : {}),
      ...(status ? { status } : {}),
      ...(teamId ? { teamId } : {}),
      ...(sortBy ? { sortBy } : {}),
      ...(sortDir ? { sortDir } : {}),
      ...(limit !== undefined && Number.isFinite(limit) ? { limit } : {}),
      ...(offset !== undefined && Number.isFinite(offset) ? { offset } : {}),
    });
  }

  @Get(':playerId')
  getPlayerDetail(@Param('leagueId') leagueId: string, @Param('playerId') playerId: string) {
    return this.playersService.getPlayerDetail(leagueId, playerId);
  }
}
