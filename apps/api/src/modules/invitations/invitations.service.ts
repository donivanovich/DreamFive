import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { joinLeagueWithRandomTeamInTx } from '@dream5/database';
import type { LeagueInvitationDto } from '@dream5/shared';

import { PrismaService } from '../../database/prisma.service.js';

@Injectable()
export class InvitationsService {
  constructor(private readonly prisma: PrismaService) {}

  async listPendingForUser(userId: string): Promise<readonly LeagueInvitationDto[]> {
    const rows = await this.prisma.client.leagueInvitation.findMany({
      where: { invitedUserId: userId, status: 'PENDING' },
      include: {
        league: true,
        invitedBy: { include: { profile: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return rows.map((row) => ({
      id: row.id,
      leagueId: row.leagueId,
      leagueName: row.league.name,
      invitedByUsername: row.invitedBy.profile?.username ?? row.invitedBy.email,
      invitedTag: row.invitedTag,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async listByLeague(leagueId: string): Promise<readonly LeagueInvitationDto[]> {
    const rows = await this.prisma.client.leagueInvitation.findMany({
      where: { leagueId },
      include: {
        league: true,
        invitedBy: { include: { profile: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return rows.map((row) => ({
      id: row.id,
      leagueId: row.leagueId,
      leagueName: row.league.name,
      invitedByUsername: row.invitedBy.profile?.username ?? row.invitedBy.email,
      invitedTag: row.invitedTag,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async inviteByTag(params: {
    readonly leagueId: string;
    readonly invitedByUserId: string;
    readonly tag: string;
  }): Promise<LeagueInvitationDto> {
    const normalizedTag = params.tag.trim().toUpperCase();
    const targetProfile = await this.prisma.client.userProfile.findFirst({
      where: { tag: { equals: normalizedTag, mode: 'insensitive' } },
      include: { user: true },
    });
    if (!targetProfile) {
      throw new NotFoundException(`No existe ningún usuario con la etiqueta ${normalizedTag}.`);
    }

    if (targetProfile.userId === params.invitedByUserId) {
      throw new BadRequestException('No puedes enviarte una invitación a ti mismo.');
    }

    const league = await this.prisma.client.league.findUnique({
      where: { id: params.leagueId },
      include: { _count: { select: { members: true } } },
    });
    if (!league) {
      throw new NotFoundException('Liga no encontrada.');
    }
    if (league._count.members >= league.maxParticipants) {
      throw new ConflictException('La liga ya ha alcanzado el límite de 30 participantes.');
    }

    const alreadyMember = await this.prisma.client.leagueMember.findUnique({
      where: {
        leagueId_userId: { leagueId: params.leagueId, userId: targetProfile.userId },
      },
    });
    if (alreadyMember) {
      throw new ConflictException('Ese usuario ya es miembro de esta liga.');
    }

    const existingInvite = await this.prisma.client.leagueInvitation.findFirst({
      where: {
        leagueId: params.leagueId,
        invitedUserId: targetProfile.userId,
        status: 'PENDING',
      },
    });
    if (existingInvite) {
      throw new ConflictException('Ya existe una invitación pendiente para ese usuario.');
    }

    const created = await this.prisma.client.leagueInvitation.create({
      data: {
        leagueId: params.leagueId,
        invitedByUserId: params.invitedByUserId,
        invitedUserId: targetProfile.userId,
        invitedTag: targetProfile.tag,
        status: 'PENDING',
      },
      include: {
        league: true,
        invitedBy: { include: { profile: true } },
      },
    });

    return {
      id: created.id,
      leagueId: created.leagueId,
      leagueName: created.league.name,
      invitedByUsername: created.invitedBy.profile?.username ?? created.invitedBy.email,
      invitedTag: created.invitedTag,
      status: created.status,
      createdAt: created.createdAt.toISOString(),
    };
  }

  async respondInvitation(params: {
    readonly invitationId: string;
    readonly userId: string;
    readonly accept: boolean;
  }): Promise<{
    readonly status: 'ACCEPTED' | 'REJECTED';
    readonly leagueId: string;
    readonly assignedTeamId?: string;
    readonly assignedTeamName?: string;
    readonly assignedTeamCode?: string;
    readonly inheritedPoints?: number;
  }> {
    const invitation = await this.prisma.client.leagueInvitation.findUnique({
      where: { id: params.invitationId },
    });
    if (!invitation) {
      throw new NotFoundException('Invitación no encontrada.');
    }
    if (invitation.invitedUserId !== params.userId) {
      throw new ForbiddenException('No puedes responder a una invitación que no es tuya.');
    }
    if (invitation.status !== 'PENDING') {
      throw new ConflictException(`La invitación ya fue procesada (${invitation.status}).`);
    }

    if (!params.accept) {
      await this.prisma.client.leagueInvitation.update({
        where: { id: invitation.id },
        data: { status: 'REJECTED', respondedAt: new Date() },
      });
      return { status: 'REJECTED', leagueId: invitation.leagueId };
    }

    const joinResult = await this.prisma.client.$transaction(async (tx) => {
      const updated = await tx.leagueInvitation.updateMany({
        where: { id: invitation.id, status: 'PENDING' },
        data: { status: 'ACCEPTED', respondedAt: new Date() },
      });
      if (updated.count !== 1) {
        throw new ConflictException('La invitación ya fue respondida previamente.');
      }

      return joinLeagueWithRandomTeamInTx(tx, {
        leagueId: invitation.leagueId,
        userId: params.userId,
        role: 'MEMBER',
      });
    });

    return {
      status: 'ACCEPTED',
      leagueId: invitation.leagueId,
      assignedTeamId: joinResult.leagueTeamId,
      assignedTeamName: joinResult.teamName,
      assignedTeamCode: joinResult.teamCode,
      inheritedPoints: joinResult.inheritedPoints,
    };
  }
}
