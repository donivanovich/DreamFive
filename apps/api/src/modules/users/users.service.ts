import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { deleteUserAccountWithLeagueHandover, verifyPassword } from '@dream5/database';
import {
  type AccountDeletionContextDto,
  type AuthUserDto,
  type ConfirmEmailChangeInput,
  type DeleteAccountInput,
  type EmailChangeRequestResponseDto,
  type PasswordResetRequestResponseDto,
  PROVISIONAL_GAME_CONFIG,
  type RequestEmailChangeInput,
  type UpdatePreferencesInput,
  type UpdateProfileInput,
} from '@dream5/shared';

import { API_ENV } from '../../config/app-config.module.js';
import type { ApiEnv } from '../../config/env.schema.js';
import { PrismaService } from '../../database/prisma.service.js';
import {
  deriveInitials,
  generateSixDigitCode,
  parseUserPreferences,
  sha256Hex,
  timingSafeHashMatch,
  toAuthUserDto,
} from '../auth/auth.service.js';
import { MailService } from '../mail/mail.service.js';

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

function detectImageExtension(buffer: Buffer): 'png' | 'jpg' | 'webp' | null {
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'png';
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpg';
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}

@Injectable()
export class UsersService {
  constructor(
    @Inject(API_ENV) private readonly env: ApiEnv,
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  async updatePreferences(userId: string, input: UpdatePreferencesInput): Promise<AuthUserDto> {
    const existing = await this.prisma.client.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });
    if (!existing?.profile) {
      throw new NotFoundException('Usuario no encontrado.');
    }

    const current = parseUserPreferences(existing.profile.preferencesJson);
    const merged = {
      tradeAlerts: input.tradeAlerts ?? current.tradeAlerts,
      injuryAlerts: input.injuryAlerts ?? current.injuryAlerts,
      lineupReminder: input.lineupReminder ?? current.lineupReminder,
      compactTables: input.compactTables ?? current.compactTables,
      themeMode: input.themeMode ?? current.themeMode,
      accentColor: input.accentColor ?? current.accentColor,
      language: input.language ?? current.language,
    };

    const updatedProfile = await this.prisma.client.userProfile.update({
      where: { userId },
      data: { preferencesJson: merged },
    });

    return toAuthUserDto({
      ...existing,
      profile: updatedProfile,
    });
  }

  async updateProfile(userId: string, input: UpdateProfileInput): Promise<AuthUserDto> {
    const existing = await this.prisma.client.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });
    if (!existing?.profile) {
      throw new NotFoundException('Usuario no encontrado.');
    }

    const nextUsername = input.username.trim();
    if (nextUsername.toLowerCase() !== existing.profile.username.toLowerCase()) {
      const duplicateUsername = await this.prisma.client.userProfile.findFirst({
        where: { username: nextUsername, userId: { not: userId } },
        select: { id: true },
      });
      if (duplicateUsername) {
        throw new ConflictException('Ese nombre de mánager ya está en uso.');
      }
    }

    const nextInitials = deriveInitials(nextUsername);
    const updatedProfile = await this.prisma.client.userProfile.update({
      where: { userId },
      data: {
        username: nextUsername,
        initials: nextInitials,
      },
    });

    return toAuthUserDto({
      ...existing,
      profile: updatedProfile,
    });
  }

  async requestEmailChange(
    userId: string,
    input: RequestEmailChangeInput,
  ): Promise<EmailChangeRequestResponseDto> {
    const existing = await this.prisma.client.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });
    if (!existing?.profile) {
      throw new NotFoundException('Usuario no encontrado.');
    }

    const passwordOk = await verifyPassword(input.currentPassword, existing.passwordHash);
    if (!passwordOk) {
      throw new UnauthorizedException('La contraseña actual no es correcta.');
    }

    const nextEmail = input.newEmail.trim().toLowerCase();
    if (nextEmail === existing.email) {
      throw new BadRequestException('El nuevo correo debe ser distinto al correo actual.');
    }

    const duplicate = await this.prisma.client.user.findFirst({
      where: { email: nextEmail, id: { not: userId } },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException('Ya existe otra cuenta registrada con ese correo electrónico.');
    }

    const code = generateSixDigitCode();
    const expiresAt = new Date(
      Date.now() + PROVISIONAL_GAME_CONFIG.auth.emailVerificationTtlMinutes * 60_000,
    );
    const now = new Date();

    await this.prisma.client.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { pendingEmail: nextEmail },
      });
      await tx.emailVerificationCode.updateMany({
        where: { userId, purpose: 'EMAIL_CHANGE', consumedAt: null },
        data: { consumedAt: now },
      });
      await tx.emailVerificationCode.create({
        data: {
          userId,
          targetEmail: nextEmail,
          purpose: 'EMAIL_CHANGE',
          codeHash: sha256Hex(code),
          expiresAt,
        },
      });
    });

    const prefs = parseUserPreferences(existing.profile.preferencesJson);
    try {
      await this.mail.sendEmailChangeVerificationEmail({
        to: nextEmail,
        username: existing.profile.username,
        code,
        expiresAt,
        language: prefs.language,
      });
    } catch (error) {
      await this.prisma.client
        .$transaction(async (tx) => {
          await tx.user.update({
            where: { id: userId },
            data: { pendingEmail: null },
          });
          await tx.emailVerificationCode.updateMany({
            where: { userId, purpose: 'EMAIL_CHANGE', consumedAt: null },
            data: { consumedAt: new Date() },
          });
        })
        .catch(() => undefined);
      throw error;
    }

    return {
      pendingEmail: nextEmail,
      expiresAt: expiresAt.toISOString(),
    };
  }

  async confirmEmailChange(userId: string, input: ConfirmEmailChangeInput): Promise<AuthUserDto> {
    const existing = await this.prisma.client.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });
    if (!existing?.profile) {
      throw new NotFoundException('Usuario no encontrado.');
    }
    if (!existing.pendingEmail) {
      throw new BadRequestException('No hay ningún cambio de correo pendiente de verificar.');
    }

    const latestCode = await this.prisma.client.emailVerificationCode.findFirst({
      where: {
        userId,
        purpose: 'EMAIL_CHANGE',
        targetEmail: existing.pendingEmail,
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

    const targetEmail = existing.pendingEmail;
    const duplicate = await this.prisma.client.user.findFirst({
      where: { email: targetEmail, id: { not: userId } },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException('Ese correo electrónico ya fue reclamado por otra cuenta.');
    }

    const now = new Date();
    const updatedUser = await this.prisma.client.$transaction(async (tx) => {
      await tx.emailVerificationCode.updateMany({
        where: { userId, purpose: 'EMAIL_CHANGE', consumedAt: null },
        data: { consumedAt: now },
      });
      return tx.user.update({
        where: { id: userId },
        data: {
          email: targetEmail,
          pendingEmail: null,
          emailVerifiedAt: now,
        },
        include: { profile: true },
      });
    });

    return toAuthUserDto(updatedUser);
  }

  async requestPasswordReset(userId: string): Promise<PasswordResetRequestResponseDto> {
    const existing = await this.prisma.client.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });
    if (!existing?.profile) {
      throw new NotFoundException('Usuario no encontrado.');
    }

    const rawToken = randomBytes(32).toString('hex');
    const expiresAt = new Date(
      Date.now() + PROVISIONAL_GAME_CONFIG.auth.passwordResetTtlMinutes * 60_000,
    );
    const now = new Date();

    await this.prisma.client.$transaction(async (tx) => {
      await tx.passwordResetToken.updateMany({
        where: { userId, consumedAt: null },
        data: { consumedAt: now },
      });
      await tx.passwordResetToken.create({
        data: {
          userId,
          tokenHash: sha256Hex(rawToken),
          expiresAt,
        },
      });
    });

    const baseWebUrl = this.env.WEB_PUBLIC_URL.replace(/\/$/, '');
    const resetUrl = `${baseWebUrl}/change-password?token=${encodeURIComponent(rawToken)}`;
    const prefs = parseUserPreferences(existing.profile.preferencesJson);

    await this.mail.sendPasswordResetEmail({
      to: existing.email,
      username: existing.profile.username,
      resetToken: rawToken,
      resetUrl,
      expiresAt,
      language: prefs.language,
    });

    return {
      sent: true,
      email: existing.email,
      expiresAt: expiresAt.toISOString(),
    };
  }

  async uploadAvatar(userId: string, buffer: Buffer): Promise<AuthUserDto> {
    if (buffer.length === 0 || buffer.length > MAX_AVATAR_BYTES) {
      throw new BadRequestException('La imagen debe pesar entre 1 byte y 5 MB.');
    }

    const ext = detectImageExtension(buffer);
    if (!ext) {
      throw new BadRequestException(
        'Formato de imagen no válido. Solo se permiten PNG, JPG o WEBP.',
      );
    }

    const existing = await this.prisma.client.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });
    if (!existing?.profile) {
      throw new NotFoundException('Usuario no encontrado.');
    }

    const avatarsDir = join(resolve(this.env.UPLOAD_DIR), 'avatars');
    await mkdir(avatarsDir, { recursive: true });

    const filename = `${userId}-${randomUUID()}.${ext}`;
    const targetPath = join(avatarsDir, filename);
    await writeFile(targetPath, buffer);

    await this.deleteLocalAvatarFile(existing.profile.avatarUrl);

    const avatarUrl = `/uploads/avatars/${filename}`;
    const updatedProfile = await this.prisma.client.userProfile.update({
      where: { userId },
      data: { avatarUrl },
    });

    return toAuthUserDto({
      ...existing,
      profile: updatedProfile,
    });
  }

  async removeAvatar(userId: string): Promise<AuthUserDto> {
    const existing = await this.prisma.client.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });
    if (!existing?.profile) {
      throw new NotFoundException('Usuario no encontrado.');
    }

    await this.deleteLocalAvatarFile(existing.profile.avatarUrl);

    const updatedProfile = await this.prisma.client.userProfile.update({
      where: { userId },
      data: { avatarUrl: null },
    });

    return toAuthUserDto({
      ...existing,
      profile: updatedProfile,
    });
  }

  private async deleteLocalAvatarFile(avatarUrl: string | null): Promise<void> {
    if (!avatarUrl?.startsWith('/uploads/avatars/')) {
      return;
    }
    const safeName = basename(avatarUrl);
    const fullPath = join(resolve(this.env.UPLOAD_DIR), 'avatars', safeName);
    if (existsSync(fullPath)) {
      await unlink(fullPath).catch(() => undefined);
    }
  }

  async searchByQuery(query: string): Promise<
    readonly {
      readonly id: string;
      readonly username: string;
      readonly tag: string;
      readonly initials: string;
      readonly avatarUrl: string | null;
    }[]
  > {
    const clean = query.trim();
    if (clean.length < 2) {
      return [];
    }

    const profiles = await this.prisma.client.userProfile.findMany({
      where: {
        OR: [
          { tag: { contains: clean, mode: 'insensitive' } },
          { username: { contains: clean, mode: 'insensitive' } },
        ],
      },
      take: 10,
      orderBy: { username: 'asc' },
    });

    return profiles.map((p) => ({
      id: p.userId,
      username: p.username,
      tag: p.tag,
      initials: p.initials,
      avatarUrl: p.avatarUrl ?? null,
    }));
  }

  async getDeletionContext(userId: string): Promise<AccountDeletionContextDto> {
    const presidedLeagues = await this.prisma.client.league.findMany({
      where: { presidentUserId: userId },
      include: {
        members: {
          where: { userId: { not: userId } },
          include: {
            user: { include: { profile: true } },
            team: true,
          },
          orderBy: { joinedAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return {
      presidedLeagues: presidedLeagues.map((league) => ({
        leagueId: league.id,
        leagueName: league.name,
        candidates: league.members
          .filter((m) => m.user.profile !== null)
          .map((m) => ({
            userId: m.userId,
            username: m.user.profile?.username ?? m.user.email,
            tag: m.user.profile?.tag ?? '',
            teamName: m.team.name,
            teamCode: m.team.code,
          })),
      })),
    };
  }

  async deleteAccount(userId: string, input: DeleteAccountInput) {
    try {
      const result = await deleteUserAccountWithLeagueHandover(this.prisma.client, {
        userId,
        confirmUsername: input.confirmUsername.trim(),
        successorPresidents: input.successorPresidents,
      });

      await this.deleteLocalAvatarFile(result.vacatedAvatarUrl);

      return {
        deleted: true as const,
        deletedLeagueIds: result.deletedLeagueIds,
        promotedLeagues: result.promotedLeagues,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'No se pudo eliminar la cuenta.';
      if (msg.startsWith('NOT_FOUND:')) {
        throw new NotFoundException(msg.slice('NOT_FOUND:'.length));
      }
      if (msg.startsWith('USERNAME_MISMATCH:')) {
        throw new BadRequestException(msg.slice('USERNAME_MISMATCH:'.length));
      }
      if (msg.startsWith('SUCCESSOR_REQUIRED:')) {
        throw new BadRequestException(msg.slice('SUCCESSOR_REQUIRED:'.length));
      }
      throw error;
    }
  }
}
