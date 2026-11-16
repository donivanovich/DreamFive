import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { hashPassword, verifyPassword } from '@dream5/database';
import {
  ADMIN_SIMULATION_EMAIL,
  type AccentColor,
  type AppLanguage,
  type AuthResponseDto,
  type AuthUserDto,
  type ConfirmPasswordResetInput,
  type LoginInput,
  type PasswordResetValidationDto,
  PROVISIONAL_GAME_CONFIG,
  type RegisterInput,
  type RegisterPendingResponseDto,
  type ResendVerificationInput,
  type ThemeMode,
  type UserPreferencesDto,
  type VerifyEmailInput,
} from '@dream5/shared';

import { API_ENV } from '../../config/app-config.module.js';
import type { ApiEnv } from '../../config/env.schema.js';
import { PrismaService } from '../../database/prisma.service.js';
import { MailService } from '../mail/mail.service.js';

export const DEFAULT_USER_PREFERENCES: UserPreferencesDto = {
  tradeAlerts: true,
  injuryAlerts: true,
  lineupReminder: true,
  compactTables: false,
  themeMode: 'dark',
  accentColor: 'orange',
  language: 'en',
};

const VALID_THEME_MODES = new Set<ThemeMode>(['dark', 'light']);
const VALID_ACCENT_COLORS = new Set<AccentColor>([
  'orange',
  'blue',
  'green',
  'red',
  'pink',
  'purple',
]);
const VALID_LANGUAGES = new Set<AppLanguage>(['en', 'es']);

export function parseUserPreferences(raw: unknown): UserPreferencesDto {
  if (!raw || typeof raw !== 'object') {
    return DEFAULT_USER_PREFERENCES;
  }
  const obj = raw as Record<string, unknown>;
  const rawTheme = obj['themeMode'];
  const rawAccent = obj['accentColor'];
  const rawLang = obj['language'];

  return {
    tradeAlerts:
      typeof obj['tradeAlerts'] === 'boolean'
        ? obj['tradeAlerts']
        : DEFAULT_USER_PREFERENCES.tradeAlerts,
    injuryAlerts:
      typeof obj['injuryAlerts'] === 'boolean'
        ? obj['injuryAlerts']
        : DEFAULT_USER_PREFERENCES.injuryAlerts,
    lineupReminder:
      typeof obj['lineupReminder'] === 'boolean'
        ? obj['lineupReminder']
        : DEFAULT_USER_PREFERENCES.lineupReminder,
    compactTables:
      typeof obj['compactTables'] === 'boolean'
        ? obj['compactTables']
        : DEFAULT_USER_PREFERENCES.compactTables,
    themeMode:
      typeof rawTheme === 'string' && VALID_THEME_MODES.has(rawTheme as ThemeMode)
        ? (rawTheme as ThemeMode)
        : DEFAULT_USER_PREFERENCES.themeMode,
    accentColor:
      typeof rawAccent === 'string' && VALID_ACCENT_COLORS.has(rawAccent as AccentColor)
        ? (rawAccent as AccentColor)
        : DEFAULT_USER_PREFERENCES.accentColor,
    language:
      typeof rawLang === 'string' && VALID_LANGUAGES.has(rawLang as AppLanguage)
        ? (rawLang as AppLanguage)
        : DEFAULT_USER_PREFERENCES.language,
  };
}

export function sha256Hex(rawValue: string): string {
  return createHash('sha256').update(rawValue).digest('hex');
}

export function timingSafeHashMatch(rawCandidate: string, expectedHexDigest: string): boolean {
  const candidateHex = sha256Hex(rawCandidate);
  const a = Buffer.from(candidateHex, 'hex');
  const b = Buffer.from(expectedHexDigest, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

export function generateSixDigitCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export function deriveInitials(username: string): string {
  const parts = username.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const first = parts[0]?.[0] ?? 'D';
    const second = parts[1]?.[0] ?? '5';
    return `${first}${second}`.toUpperCase();
  }
  const clean = username.trim();
  return `${clean[0] ?? 'D'}${clean[1] ?? '5'}`.toUpperCase();
}

export function toAuthUserDto(user: {
  readonly id: string;
  readonly email: string;
  readonly pendingEmail: string | null;
  readonly emailVerifiedAt: Date | null;
  readonly role: 'USER' | 'ADMIN';
  readonly createdAt: Date;
  readonly profile: {
    readonly username: string;
    readonly tag: string;
    readonly initials: string;
    readonly avatarUrl: string | null;
    readonly preferencesJson: unknown;
  } | null;
}): AuthUserDto {
  if (!user.profile) {
    throw new UnauthorizedException('Perfil de usuario incompleto.');
  }
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    username: user.profile.username,
    tag: user.profile.tag,
    initials: user.profile.initials,
    avatarUrl: user.profile.avatarUrl ?? null,
    emailVerified: Boolean(user.emailVerifiedAt),
    pendingEmail: user.pendingEmail ?? null,
    createdAt: user.createdAt.toISOString(),
    preferences: parseUserPreferences(user.profile.preferencesJson),
  };
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(API_ENV) private readonly env: ApiEnv,
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  private async generateUniqueTag(): Promise<string> {
    for (let attempt = 0; attempt < 25; attempt += 1) {
      const code = String(randomInt(1000, 9999));
      const candidate = `#D5-${code}`;
      const exists = await this.prisma.client.userProfile.findUnique({
        where: { tag: candidate },
        select: { id: true },
      });
      if (!exists) {
        return candidate;
      }
    }
    return `#D5-${randomBytes(3).toString('hex').toUpperCase()}`;
  }

  private async issueSession(userId: string): Promise<string> {
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = sha256Hex(rawToken);
    const expiresAt = new Date(Date.now() + this.env.AUTH_SESSION_TTL_HOURS * 3600_000);

    await this.prisma.client.userSession.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
      },
    });
    return rawToken;
  }

  async register(input: RegisterInput): Promise<RegisterPendingResponseDto> {
    const normalizedEmail = input.email.trim().toLowerCase();
    const cleanUsername = input.username.trim();

    const [existingEmail, existingUsername] = await Promise.all([
      this.prisma.client.user.findUnique({ where: { email: normalizedEmail } }),
      this.prisma.client.userProfile.findUnique({ where: { username: cleanUsername } }),
    ]);

    if (existingEmail) {
      if (!existingEmail.emailVerifiedAt) {
        throw new ConflictException(
          'EMAIL_NOT_VERIFIED: Ya existe una cuenta pendiente de verificar con este correo. Introduce o reenvía el código de 6 dígitos.',
        );
      }
      throw new ConflictException('Ya existe una cuenta registrada con ese correo electrónico.');
    }
    if (existingUsername) {
      throw new ConflictException('Ese nombre de mánager ya está en uso.');
    }

    const passwordHash = await hashPassword(input.password);
    const tag = await this.generateUniqueTag();
    const initials = deriveInitials(cleanUsername);
    const code = generateSixDigitCode();
    const expiresAt = new Date(
      Date.now() + PROVISIONAL_GAME_CONFIG.auth.emailVerificationTtlMinutes * 60_000,
    );

    const createdUserId = await this.prisma.client.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          email: normalizedEmail,
          emailVerifiedAt: null,
          passwordHash,
          role: normalizedEmail === ADMIN_SIMULATION_EMAIL ? 'ADMIN' : 'USER',
          profile: {
            create: {
              username: cleanUsername,
              tag,
              initials,
              preferencesJson: { ...DEFAULT_USER_PREFERENCES },
            },
          },
        },
      });

      await tx.emailVerificationCode.create({
        data: {
          userId: createdUser.id,
          targetEmail: normalizedEmail,
          purpose: 'REGISTRATION',
          codeHash: sha256Hex(code),
          expiresAt,
        },
      });
      return createdUser.id;
    });

    try {
      await this.mail.sendRegistrationVerificationEmail({
        to: normalizedEmail,
        username: cleanUsername,
        code,
        expiresAt,
        language: DEFAULT_USER_PREFERENCES.language,
      });
    } catch (error) {
      await this.prisma.client.user.delete({ where: { id: createdUserId } }).catch(() => undefined);
      throw error;
    }

    return {
      requiresEmailVerification: true,
      email: normalizedEmail,
      expiresAt: expiresAt.toISOString(),
    };
  }

  async verifyEmail(input: VerifyEmailInput): Promise<AuthResponseDto> {
    const normalizedEmail = input.email.trim().toLowerCase();
    const user = await this.prisma.client.user.findUnique({
      where: { email: normalizedEmail },
      include: { profile: true },
    });

    if (!user?.profile) {
      throw new BadRequestException('Código de verificación o cuenta inválidos.');
    }

    if (user.emailVerifiedAt) {
      throw new ConflictException('Esta cuenta ya ha sido verificada. Inicia sesión.');
    }

    const latestCode = await this.prisma.client.emailVerificationCode.findFirst({
      where: {
        userId: user.id,
        purpose: 'REGISTRATION',
        targetEmail: normalizedEmail,
        consumedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (
      !latestCode ||
      latestCode.expiresAt.getTime() <= Date.now() ||
      !timingSafeHashMatch(input.code.trim(), latestCode.codeHash)
    ) {
      throw new BadRequestException('El código de 6 dígitos es incorrecto o ha caducado.');
    }

    const now = new Date();
    const verifiedUser = await this.prisma.client.$transaction(async (tx) => {
      await tx.emailVerificationCode.updateMany({
        where: { userId: user.id, purpose: 'REGISTRATION', consumedAt: null },
        data: { consumedAt: now },
      });

      return tx.user.update({
        where: { id: user.id },
        data: { emailVerifiedAt: now },
        include: { profile: true },
      });
    });

    const accessToken = await this.issueSession(verifiedUser.id);
    return {
      user: toAuthUserDto(verifiedUser),
      accessToken,
    };
  }

  async resendVerification(
    input: ResendVerificationInput,
  ): Promise<{ readonly sent: true; readonly email: string; readonly expiresAt: string }> {
    const normalizedEmail = input.email.trim().toLowerCase();
    const user = await this.prisma.client.user.findUnique({
      where: { email: normalizedEmail },
      include: { profile: true },
    });

    const expiresAt = new Date(
      Date.now() + PROVISIONAL_GAME_CONFIG.auth.emailVerificationTtlMinutes * 60_000,
    );

    if (user?.profile && !user.emailVerifiedAt) {
      const code = generateSixDigitCode();
      const now = new Date();
      await this.prisma.client.$transaction(async (tx) => {
        await tx.emailVerificationCode.updateMany({
          where: { userId: user.id, purpose: 'REGISTRATION', consumedAt: null },
          data: { consumedAt: now },
        });
        await tx.emailVerificationCode.create({
          data: {
            userId: user.id,
            targetEmail: normalizedEmail,
            purpose: 'REGISTRATION',
            codeHash: sha256Hex(code),
            expiresAt,
          },
        });
      });

      const prefs = parseUserPreferences(user.profile.preferencesJson);
      await this.mail.sendRegistrationVerificationEmail({
        to: normalizedEmail,
        username: user.profile.username,
        code,
        expiresAt,
        language: prefs.language,
      });
    }

    return {
      sent: true,
      email: normalizedEmail,
      expiresAt: expiresAt.toISOString(),
    };
  }

  async login(input: LoginInput): Promise<AuthResponseDto> {
    const normalizedEmail = input.email.trim().toLowerCase();
    const user = await this.prisma.client.user.findUnique({
      where: { email: normalizedEmail },
      include: { profile: true },
    });

    if (!user) {
      throw new UnauthorizedException('Credenciales incorrectas.');
    }

    const valid = await verifyPassword(input.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Credenciales incorrectas.');
    }

    if (!user.emailVerifiedAt) {
      throw new ForbiddenException(
        'EMAIL_NOT_VERIFIED: Debes verificar tu correo con el código de 6 dígitos antes de iniciar sesión.',
      );
    }

    const accessToken = await this.issueSession(user.id);
    return {
      user: toAuthUserDto(user),
      accessToken,
    };
  }

  async validatePasswordResetToken(
    rawToken: string | undefined,
  ): Promise<PasswordResetValidationDto> {
    const token = rawToken?.trim() ?? '';
    if (token.length < 20) {
      return { valid: false, reason: 'MISSING' };
    }

    const record = await this.prisma.client.passwordResetToken.findUnique({
      where: { tokenHash: sha256Hex(token) },
      include: { user: { select: { email: true } } },
    });

    if (!record) {
      return { valid: false, reason: 'INVALID' };
    }
    if (record.consumedAt !== null) {
      return { valid: false, reason: 'USED' };
    }
    if (record.expiresAt.getTime() <= Date.now()) {
      return { valid: false, reason: 'EXPIRED' };
    }

    return {
      valid: true,
      email: record.user.email,
    };
  }

  async confirmPasswordReset(
    input: ConfirmPasswordResetInput,
  ): Promise<{ readonly message: string }> {
    const token = input.token.trim();
    const record = await this.prisma.client.passwordResetToken.findUnique({
      where: { tokenHash: sha256Hex(token) },
    });

    const invalidTokenMsg =
      'El enlace de cambio de contraseña no es válido, ya fue utilizado o ha caducado.';
    if (!record) {
      throw new BadRequestException(invalidTokenMsg);
    }
    if (record.consumedAt !== null || record.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException(invalidTokenMsg);
    }

    const userId = record.userId;
    const newHash = await hashPassword(input.newPassword);
    const now = new Date();
    await this.prisma.client.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { passwordHash: newHash },
      });
      await tx.passwordResetToken.updateMany({
        where: { userId, consumedAt: null },
        data: { consumedAt: now },
      });
    });

    return { message: 'Contraseña actualizada correctamente.' };
  }

  async resolveSessionUser(rawToken: string): Promise<AuthUserDto | null> {
    if (!rawToken || rawToken.length < 16) {
      return null;
    }
    const tokenHash = sha256Hex(rawToken);
    const session = await this.prisma.client.userSession.findUnique({
      where: { tokenHash },
      include: {
        user: {
          include: { profile: true },
        },
      },
    });

    const validSession = session?.revokedAt === null ? session : null;
    if (
      !validSession ||
      validSession.expiresAt.getTime() <= Date.now() ||
      !validSession.user.emailVerifiedAt
    ) {
      return null;
    }

    return toAuthUserDto(validSession.user);
  }

  async revokeSession(rawToken: string | undefined): Promise<void> {
    if (!rawToken) {
      return;
    }
    const tokenHash = sha256Hex(rawToken);
    await this.prisma.client.userSession.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
