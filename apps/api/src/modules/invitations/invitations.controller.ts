import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  type AuthUserDto,
  type InviteByTagInput,
  inviteByTagSchema,
  type LeagueInvitationDto,
} from '@dream5/shared';

import { CurrentUser, LeaguePresidentGuard, SessionAuthGuard } from '../../common/auth.guards.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { InvitationsService } from './invitations.service.js';

@ApiTags('invitations')
@ApiBearerAuth()
@UseGuards(SessionAuthGuard)
@Controller()
export class InvitationsController {
  constructor(private readonly invitationsService: InvitationsService) {}

  @Get('invitations/pending')
  listMyPending(@CurrentUser() user: AuthUserDto): Promise<readonly LeagueInvitationDto[]> {
    return this.invitationsService.listPendingForUser(user.id);
  }

  @Get('leagues/:leagueId/invitations')
  @UseGuards(LeaguePresidentGuard)
  listLeagueInvitations(
    @Param('leagueId') leagueId: string,
  ): Promise<readonly LeagueInvitationDto[]> {
    return this.invitationsService.listByLeague(leagueId);
  }

  @Post('leagues/:leagueId/invitations')
  @UseGuards(LeaguePresidentGuard)
  inviteByTag(
    @Param('leagueId') leagueId: string,
    @CurrentUser() user: AuthUserDto,
    @Body(new ZodValidationPipe(inviteByTagSchema)) body: InviteByTagInput,
  ): Promise<LeagueInvitationDto> {
    return this.invitationsService.inviteByTag({
      leagueId,
      invitedByUserId: user.id,
      tag: body.tag,
    });
  }

  @Post('invitations/:invitationId/accept')
  acceptInvitation(@Param('invitationId') invitationId: string, @CurrentUser() user: AuthUserDto) {
    return this.invitationsService.respondInvitation({
      invitationId,
      userId: user.id,
      accept: true,
    });
  }

  @Post('invitations/:invitationId/reject')
  rejectInvitation(@Param('invitationId') invitationId: string, @CurrentUser() user: AuthUserDto) {
    return this.invitationsService.respondInvitation({
      invitationId,
      userId: user.id,
      accept: false,
    });
  }
}
