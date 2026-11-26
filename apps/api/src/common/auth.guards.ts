import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ADMIN_SIMULATION_EMAIL, type AuthUserDto, type LeagueRole } from '@dreamfive/shared';
import type { Redis } from 'ioredis';

import { API_ENV } from '../config/app-config.module.js';
import type { ApiEnv } from '../config/env.schema.js';
import { PrismaService } from '../database/prisma.service.js';
import { AuthService } from '../modules/auth/auth.service.js';
import { REDIS_CLIENT } from '../redis/redis.module.js';
import { parseCookieHeader } from './http-cookies.js';

export interface LeagueMembershipContext {
  readonly leagueId: string;
  readonly leagueTeamId: string;
  readonly role: LeagueRole;
}

export interface AuthenticatedFastifyRequest {
  readonly headers: {
    readonly authorization?: string;
    readonly cookie?: string;
  };
  readonly ip?: string;
  readonly url?: string;
  readonly params?: Record<string, string | undefined>;
  authUser?: AuthUserDto;
  rawAccessToken?: string;
  leagueMembership?: LeagueMembershipContext;
}

export function extractAccessTokenFromRequest(
  request: AuthenticatedFastifyRequest,
  cookieName: string,
): string | undefined {
  const authHeader = request.headers.authorization;
  if (authHeader?.toLowerCase().startsWith('bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token) {
      return token;
    }
  }
  const cookies = parseCookieHeader(request.headers.cookie);
  const cookieToken = cookies[cookieName];
  return cookieToken && cookieToken.length > 0 ? cookieToken : undefined;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUserDto => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedFastifyRequest>();
    if (!request.authUser) {
      throw new UnauthorizedException('Sesión de usuario no autenticada.');
    }
    return request.authUser;
  },
);

export const CurrentMembership = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): LeagueMembershipContext => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedFastifyRequest>();
    if (!request.leagueMembership) {
      throw new ForbiddenException('Contexto de pertenencia a la liga no resuelto.');
    }
    return request.leagueMembership;
  },
);

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    @Inject(API_ENV) private readonly env: ApiEnv,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedFastifyRequest>();
    const token = extractAccessTokenFromRequest(request, this.env.AUTH_COOKIE_NAME);
    if (!token) {
      throw new UnauthorizedException('Debes iniciar sesión para acceder a este recurso.');
    }

    const user = await this.authService.resolveSessionUser(token);
    if (!user) {
      throw new UnauthorizedException('La sesión ha expirado o no es válida.');
    }

    request.authUser = user;
    request.rawAccessToken = token;
    return true;
  }
}

@Injectable()
export class LeagueMemberGuard implements CanActivate {
  constructor(
    @Inject(API_ENV) private readonly env: ApiEnv,
    private readonly authService: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedFastifyRequest>();
    if (!request.authUser) {
      const token = extractAccessTokenFromRequest(request, this.env.AUTH_COOKIE_NAME);
      if (!token) {
        throw new UnauthorizedException('Debes iniciar sesión para acceder a esta liga.');
      }
      const user = await this.authService.resolveSessionUser(token);
      if (!user) {
        throw new UnauthorizedException('La sesión ha expirado o no es válida.');
      }
      request.authUser = user;
      request.rawAccessToken = token;
    }

    const leagueId = request.params?.['leagueId'];
    if (!leagueId) {
      throw new ForbiddenException('Identificador de liga obligatorio.');
    }

    const membership = await this.prisma.client.leagueMember.findUnique({
      where: {
        leagueId_userId: {
          leagueId,
          userId: request.authUser.id,
        },
      },
    });

    if (!membership) {
      throw new ForbiddenException('No tienes acceso a esta liga privada.');
    }

    request.leagueMembership = {
      leagueId: membership.leagueId,
      leagueTeamId: membership.leagueTeamId,
      role: membership.role,
    };
    return true;
  }
}

@Injectable()
export class LeaguePresidentGuard implements CanActivate {
  constructor(private readonly memberGuard: LeagueMemberGuard) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    await this.memberGuard.canActivate(context);
    const request = context.switchToHttp().getRequest<AuthenticatedFastifyRequest>();
    if (request.leagueMembership?.role !== 'PRESIDENT') {
      throw new ForbiddenException(
        'Solo el presidente de esta liga puede ejecutar esta operación.',
      );
    }
    return true;
  }
}

@Injectable()
export class AdminSimulationGuard implements CanActivate {
  constructor(private readonly sessionGuard: SessionAuthGuard) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    await this.sessionGuard.canActivate(context);
    const req = context.switchToHttp().getRequest<{ authUser?: AuthUserDto }>();
    const email = req.authUser?.email.trim().toLowerCase() ?? '';
    if (email !== ADMIN_SIMULATION_EMAIL) {
      throw new ForbiddenException(
        `Solo el administrador autorizado (${ADMIN_SIMULATION_EMAIL}) puede ejecutar simulaciones.`,
      );
    }
    return true;
  }
}

@Injectable()
export class DevToolsGuard extends AdminSimulationGuard {}

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    @Inject(API_ENV) private readonly env: ApiEnv,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedFastifyRequest>();
    const clientIp = request.ip ?? 'unknown';
    const key = `${this.env.QUEUE_PREFIX}:rl:${clientIp}:${request.url ?? 'route'}`;

    try {
      const current = await this.redis.incr(key);
      if (current === 1) {
        await this.redis.pexpire(key, this.env.RATE_LIMIT_WINDOW_MS);
      }
      if (current > this.env.RATE_LIMIT_MAX_REQUESTS) {
        throw new HttpException(
          'Demasiadas solicitudes consecutivas. Inténtalo de nuevo en unos segundos.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      // Si Redis no estuviera accesible momentáneamente, no bloqueamos operaciones legítimas
    }
    return true;
  }
}
