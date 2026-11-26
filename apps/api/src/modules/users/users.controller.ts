import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { MultipartFile } from '@fastify/multipart';
import {
  type AccountDeletionContextDto,
  type AuthUserDto,
  type ConfirmEmailChangeInput,
  confirmEmailChangeSchema,
  type DeleteAccountInput,
  deleteAccountSchema,
  type EmailChangeRequestResponseDto,
  type PasswordResetRequestResponseDto,
  type RequestEmailChangeInput,
  requestEmailChangeSchema,
  type UpdatePreferencesInput,
  updatePreferencesSchema,
  type UpdateProfileInput,
  updateProfileSchema,
} from '@dreamfive/shared';

import { CurrentUser, RateLimitGuard, SessionAuthGuard } from '../../common/auth.guards.js';
import { buildClearedCookieHeader } from '../../common/http-cookies.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { API_ENV } from '../../config/app-config.module.js';
import type { ApiEnv } from '../../config/env.schema.js';
import { UsersService } from './users.service.js';

interface MultipartFastifyRequest {
  file?: () => Promise<MultipartFile | undefined>;
}

interface HeaderSetterReply {
  header(name: string, value: string): unknown;
}

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(SessionAuthGuard)
@Controller('users')
export class UsersController {
  constructor(
    @Inject(API_ENV) private readonly env: ApiEnv,
    private readonly usersService: UsersService,
  ) {}

  @Get('me')
  getMe(@CurrentUser() user: AuthUserDto): AuthUserDto {
    return user;
  }

  @Patch('me/preferences')
  updatePreferences(
    @CurrentUser() user: AuthUserDto,
    @Body(new ZodValidationPipe(updatePreferencesSchema)) body: UpdatePreferencesInput,
  ): Promise<AuthUserDto> {
    return this.usersService.updatePreferences(user.id, body);
  }

  @Patch('me/profile')
  updateProfile(
    @CurrentUser() user: AuthUserDto,
    @Body(new ZodValidationPipe(updateProfileSchema)) body: UpdateProfileInput,
  ): Promise<AuthUserDto> {
    return this.usersService.updateProfile(user.id, body);
  }

  @Post('me/email-change/request')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RateLimitGuard)
  requestEmailChange(
    @CurrentUser() user: AuthUserDto,
    @Body(new ZodValidationPipe(requestEmailChangeSchema)) body: RequestEmailChangeInput,
  ): Promise<EmailChangeRequestResponseDto> {
    return this.usersService.requestEmailChange(user.id, body);
  }

  @Post('me/email-change/confirm')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RateLimitGuard)
  confirmEmailChange(
    @CurrentUser() user: AuthUserDto,
    @Body(new ZodValidationPipe(confirmEmailChangeSchema)) body: ConfirmEmailChangeInput,
  ): Promise<AuthUserDto> {
    return this.usersService.confirmEmailChange(user.id, body);
  }

  @Post('me/password-reset/request')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RateLimitGuard)
  requestPasswordReset(@CurrentUser() user: AuthUserDto): Promise<PasswordResetRequestResponseDto> {
    return this.usersService.requestPasswordReset(user.id);
  }

  @Post('me/avatar')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RateLimitGuard)
  async uploadAvatar(
    @CurrentUser() user: AuthUserDto,
    @Req() request: MultipartFastifyRequest,
  ): Promise<AuthUserDto> {
    if (typeof request.file !== 'function') {
      throw new BadRequestException('El servidor no tiene habilitada la subida de archivos.');
    }
    const filePart = await request.file();
    if (!filePart) {
      throw new BadRequestException('Debes adjuntar una imagen.');
    }
    const buffer = await filePart.toBuffer();
    return this.usersService.uploadAvatar(user.id, buffer);
  }

  @Delete('me/avatar')
  removeAvatar(@CurrentUser() user: AuthUserDto): Promise<AuthUserDto> {
    return this.usersService.removeAvatar(user.id);
  }

  @Get('search')
  searchUsers(@Query('q') query = '') {
    return this.usersService.searchByQuery(query);
  }

  @Get('me/deletion-context')
  getDeletionContext(@CurrentUser() user: AuthUserDto): Promise<AccountDeletionContextDto> {
    return this.usersService.getDeletionContext(user.id);
  }

  @Post('me/delete')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RateLimitGuard)
  async deleteAccount(
    @CurrentUser() user: AuthUserDto,
    @Body(new ZodValidationPipe(deleteAccountSchema)) body: DeleteAccountInput,
    @Res({ passthrough: true }) reply: HeaderSetterReply,
  ) {
    const result = await this.usersService.deleteAccount(user.id, body);
    reply.header(
      'set-cookie',
      buildClearedCookieHeader(this.env.AUTH_COOKIE_NAME, this.env.NODE_ENV === 'production'),
    );
    return result;
  }
}
