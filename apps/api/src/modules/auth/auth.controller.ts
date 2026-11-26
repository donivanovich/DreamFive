import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  type AuthResponseDto,
  type AuthUserDto,
  type ConfirmPasswordResetInput,
  confirmPasswordResetSchema,
  type LoginInput,
  loginSchema,
  type PasswordResetValidationDto,
  type RegisterInput,
  type RegisterPendingResponseDto,
  registerSchema,
  type ResendVerificationInput,
  resendVerificationSchema,
  type VerifyEmailInput,
  verifyEmailSchema,
} from '@dreamfive/shared';

import {
  type AuthenticatedFastifyRequest,
  CurrentUser,
  extractAccessTokenFromRequest,
  RateLimitGuard,
  SessionAuthGuard,
} from '../../common/auth.guards.js';
import { buildClearedCookieHeader, buildSessionCookieHeader } from '../../common/http-cookies.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { API_ENV } from '../../config/app-config.module.js';
import type { ApiEnv } from '../../config/env.schema.js';
import { AuthService } from './auth.service.js';

interface HeaderSetterReply {
  header(name: string, value: string): unknown;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    @Inject(API_ENV) private readonly env: ApiEnv,
    private readonly authService: AuthService,
  ) {}

  @Post('register')
  @UseGuards(RateLimitGuard)
  async register(
    @Body(new ZodValidationPipe(registerSchema)) body: RegisterInput,
  ): Promise<RegisterPendingResponseDto> {
    return this.authService.register(body);
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RateLimitGuard)
  async verifyEmail(
    @Body(new ZodValidationPipe(verifyEmailSchema)) body: VerifyEmailInput,
    @Res({ passthrough: true }) reply: HeaderSetterReply,
  ): Promise<AuthResponseDto> {
    const result = await this.authService.verifyEmail(body);
    reply.header(
      'set-cookie',
      buildSessionCookieHeader({
        name: this.env.AUTH_COOKIE_NAME,
        value: result.accessToken,
        maxAgeSeconds: this.env.AUTH_SESSION_TTL_HOURS * 3600,
        isProduction: this.env.NODE_ENV === 'production',
      }),
    );
    return result;
  }

  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RateLimitGuard)
  resendVerification(
    @Body(new ZodValidationPipe(resendVerificationSchema)) body: ResendVerificationInput,
  ) {
    return this.authService.resendVerification(body);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RateLimitGuard)
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Res({ passthrough: true }) reply: HeaderSetterReply,
  ): Promise<AuthResponseDto> {
    const result = await this.authService.login(body);
    reply.header(
      'set-cookie',
      buildSessionCookieHeader({
        name: this.env.AUTH_COOKIE_NAME,
        value: result.accessToken,
        maxAgeSeconds: this.env.AUTH_SESSION_TTL_HOURS * 3600,
        isProduction: this.env.NODE_ENV === 'production',
      }),
    );
    return result;
  }

  @Get('password-reset/validate')
  validatePasswordReset(
    @Query('token') token: string | undefined,
  ): Promise<PasswordResetValidationDto> {
    return this.authService.validatePasswordResetToken(token);
  }

  @Post('password-reset/confirm')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RateLimitGuard)
  confirmPasswordReset(
    @Body(new ZodValidationPipe(confirmPasswordResetSchema)) body: ConfirmPasswordResetInput,
  ): Promise<{ readonly message: string }> {
    return this.authService.confirmPasswordReset(body);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() request: AuthenticatedFastifyRequest,
    @Res({ passthrough: true }) reply: HeaderSetterReply,
  ): Promise<{ readonly ok: true }> {
    const token = extractAccessTokenFromRequest(request, this.env.AUTH_COOKIE_NAME);
    await this.authService.revokeSession(token);
    reply.header(
      'set-cookie',
      buildClearedCookieHeader(this.env.AUTH_COOKIE_NAME, this.env.NODE_ENV === 'production'),
    );
    return { ok: true };
  }

  @Get('session')
  async session(
    @Req() request: AuthenticatedFastifyRequest,
  ): Promise<{ readonly user: AuthUserDto | null }> {
    const token = extractAccessTokenFromRequest(request, this.env.AUTH_COOKIE_NAME);
    if (!token) {
      return { user: null };
    }
    const user = await this.authService.resolveSessionUser(token);
    return { user };
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(SessionAuthGuard)
  me(@CurrentUser() user: AuthUserDto): { readonly user: AuthUserDto } {
    return { user };
  }
}
