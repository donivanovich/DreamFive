import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  type AuthUserDto,
  type CreateTransferOfferInput,
  createTransferOfferSchema,
  type RespondTransferOfferInput,
  respondTransferOfferSchema,
} from '@dream5/shared';
import { z } from 'zod';

import {
  CurrentMembership,
  CurrentUser,
  LeagueMemberGuard,
  type LeagueMembershipContext,
  RateLimitGuard,
} from '../../common/auth.guards.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { TransfersService } from './transfers.service.js';

const optionalActionBodySchema = z
  .object({
    note: z.string().trim().max(240).optional(),
    idempotencyKey: z.string().min(4).max(120).optional(),
  })
  .default({});

@ApiTags('transfers')
@ApiBearerAuth()
@UseGuards(LeagueMemberGuard)
@Controller('leagues/:leagueId/transfers')
export class TransfersController {
  constructor(private readonly transfersService: TransfersService) {}

  @Get()
  listTransfers(
    @Param('leagueId') leagueId: string,
    @CurrentMembership() membership: LeagueMembershipContext,
  ) {
    return this.transfersService.listLeagueTransfers(leagueId, membership.leagueTeamId);
  }

  @Post()
  @UseGuards(RateLimitGuard)
  createTransferOffer(
    @Param('leagueId') leagueId: string,
    @CurrentUser() user: AuthUserDto,
    @Body(new ZodValidationPipe(createTransferOfferSchema)) body: CreateTransferOfferInput,
  ) {
    return this.transfersService.createOffer({
      leagueId,
      userId: user.id,
      input: body,
    });
  }

  @Post(':offerId/respond')
  respondOffer(
    @Param('leagueId') leagueId: string,
    @Param('offerId') offerId: string,
    @CurrentMembership() membership: LeagueMembershipContext,
    @Body(new ZodValidationPipe(respondTransferOfferSchema)) body: RespondTransferOfferInput,
  ) {
    return this.transfersService.respondOffer({
      leagueId,
      offerId,
      callerTeamId: membership.leagueTeamId,
      action: body.decision,
      ...(body.note ? { note: body.note } : {}),
    });
  }

  @Post(':offerId/accept')
  acceptOffer(
    @Param('leagueId') leagueId: string,
    @Param('offerId') offerId: string,
    @CurrentMembership() membership: LeagueMembershipContext,
    @Body(new ZodValidationPipe(optionalActionBodySchema))
    body: { readonly note?: string; readonly idempotencyKey?: string } = {},
  ) {
    return this.transfersService.respondOffer({
      leagueId,
      offerId,
      callerTeamId: membership.leagueTeamId,
      action: 'ACCEPT',
      ...(body.note ? { note: body.note } : {}),
      ...(body.idempotencyKey ? { idempotencyKey: body.idempotencyKey } : {}),
    });
  }

  @Post(':offerId/reject')
  rejectOffer(
    @Param('leagueId') leagueId: string,
    @Param('offerId') offerId: string,
    @CurrentMembership() membership: LeagueMembershipContext,
    @Body(new ZodValidationPipe(optionalActionBodySchema))
    body: { readonly note?: string } = {},
  ) {
    return this.transfersService.respondOffer({
      leagueId,
      offerId,
      callerTeamId: membership.leagueTeamId,
      action: 'REJECT',
      ...(body.note ? { note: body.note } : {}),
    });
  }

  @Post(':offerId/cancel')
  cancelOffer(
    @Param('leagueId') leagueId: string,
    @Param('offerId') offerId: string,
    @CurrentMembership() membership: LeagueMembershipContext,
  ) {
    return this.transfersService.cancelOffer({
      leagueId,
      offerId,
      callerTeamId: membership.leagueTeamId,
    });
  }
}
