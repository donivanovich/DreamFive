import { Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import {
  CurrentMembership,
  LeagueMemberGuard,
  type LeagueMembershipContext,
} from '../../common/auth.guards.js';
import { LeagueMailService } from './league-mail.service.js';

@ApiTags('mail')
@ApiBearerAuth()
@UseGuards(LeagueMemberGuard)
@Controller('leagues/:leagueId/mail')
export class LeagueMailController {
  constructor(private readonly leagueMailService: LeagueMailService) {}

  @Get()
  listTeamMails(
    @Param('leagueId') leagueId: string,
    @CurrentMembership() membership: LeagueMembershipContext,
    @Query('category') category?: string,
    @Query('unreadOnly') unreadOnly?: string,
  ) {
    return this.leagueMailService.listTeamMails(leagueId, membership.leagueTeamId, {
      ...(category ? { category } : {}),
      unreadOnly: unreadOnly === 'true',
    });
  }

  @Post('read-all')
  markAllRead(
    @Param('leagueId') leagueId: string,
    @CurrentMembership() membership: LeagueMembershipContext,
  ) {
    return this.leagueMailService.markAllRead(leagueId, membership.leagueTeamId);
  }

  @Post(':mailId/read')
  markRead(
    @Param('leagueId') leagueId: string,
    @Param('mailId') mailId: string,
    @CurrentMembership() membership: LeagueMembershipContext,
  ) {
    return this.leagueMailService.markRead(leagueId, membership.leagueTeamId, mailId);
  }

  @Delete(':mailId')
  deleteMail(
    @Param('leagueId') leagueId: string,
    @Param('mailId') mailId: string,
    @CurrentMembership() membership: LeagueMembershipContext,
  ) {
    return this.leagueMailService.deleteMail(leagueId, membership.leagueTeamId, mailId);
  }
}
